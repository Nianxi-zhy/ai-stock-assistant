"""SQLite 数据库连接与建表

使用线程局部连接池：每个线程复用一条长连接，避免频繁创建/销毁连接；
WAL + busy_timeout 解决多线程写锁竞争。
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ai_stock.db"

# 线程局部存储，每个线程持有一条长连接
_thread_local = threading.local()

# 全局连接注册表：跟踪所有线程创建的底层 sqlite3 连接，供 close_all_connections 遍历关闭。
# 注意：sqlite3.Connection 不支持弱引用（WeakSet.add 会抛 TypeError），故用普通 set + 锁，
# 在 close_connection()/close_all_connections() 中显式移除，线程数有界，不会无限增长。
_all_connections: set = set()
_all_connections_lock = threading.Lock()


class _PooledConnection:
    """包装 sqlite3 连接：close() 为软关闭（连接归还线程池，不真正关闭）。

    真正关闭由 close_connection()/close_all_connections() 完成。
    调用方原有的 conn.close() 模式无需改动。
    """

    __slots__ = ("_conn",)

    def __init__(self, conn: sqlite3.Connection) -> None:
        object.__setattr__(self, "_conn", conn)

    def __getattr__(self, name: str):
        return getattr(self._conn, name)

    def __setattr__(self, name: str, value) -> None:
        if name == "_conn":
            object.__setattr__(self, name, value)
        else:
            setattr(self._conn, name, value)

    def close(self) -> None:
        # 软关闭：连接放回线程池复用，不真正关闭。
        # 归还前 rollback 清理未提交事务（幂等，已 commit 无副作用），防止脏事务被下一线程复用。
        try:
            self._conn.rollback()
        except Exception:
            pass


def _init_connection(conn: sqlite3.Connection) -> None:
    """统一初始化连接参数。"""
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")  # 写锁竞争时等待 5 秒而非立即报错
    conn.execute("PRAGMA synchronous=NORMAL")  # WAL 模式下安全且更快
    conn.execute("PRAGMA cache_size=-2000")    # 2MB 缓存，减少磁盘 I/O


def get_connection() -> sqlite3.Connection:
    """获取当前线程的数据库连接（线程安全，连接复用）。"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    raw = getattr(_thread_local, "raw", None)
    if raw is not None:
        try:
            raw.execute("SELECT 1")  # 检测连接是否仍然有效
            return _PooledConnection(raw)
        except sqlite3.Error:
            # 连接已失效（例如被外部关闭），清理后重新创建
            try:
                raw.close()
            except Exception:
                pass
            _thread_local.raw = None

    raw = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    _init_connection(raw)
    _thread_local.raw = raw
    with _all_connections_lock:
        _all_connections.add(raw)
    return _PooledConnection(raw)


def close_connection() -> None:
    """关闭当前线程的数据库连接（用于线程退出时清理）。"""
    raw = getattr(_thread_local, "raw", None)
    if raw is not None:
        try:
            raw.close()
        except Exception:
            pass
        with _all_connections_lock:
            _all_connections.discard(raw)
        _thread_local.raw = None


def close_all_connections() -> None:
    """关闭所有线程的数据库连接（应用关闭时清理）。"""
    with _all_connections_lock:
        conns = list(_all_connections)
        _all_connections.clear()
    for conn in conns:
        try:
            conn.close()
        except Exception:
            pass
    # 清空当前线程的局部引用（其他线程的 _thread_local.raw 若仍指向已关闭连接，
    # 下次 get_connection 会通过 SELECT 1 检测失效并自动重建）
    _thread_local.raw = None


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    """数据库连接上下文管理器。离开 with 块时软关闭连接供线程复用。"""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def insert_token_log(model: str, prompt_tokens: int, completion_tokens: int, cache_hit_tokens: int) -> None:
    total = prompt_tokens + completion_tokens
    from app.services.usage_service import calculate_cost_rmb
    cost = calculate_cost_rmb(prompt_tokens, completion_tokens, model, cache_hit_tokens)
    with get_db() as conn:
        conn.execute(
            """INSERT INTO token_log (model, prompt_tokens, completion_tokens, total_tokens, cache_hit_tokens, cost_rmb)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (model, prompt_tokens, completion_tokens, total, cache_hit_tokens, cost),
        )
        conn.commit()


def _get_schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT version FROM _schema_version WHERE id = 1").fetchone()
    return row[0] if row else 0


def _set_schema_version(conn: sqlite3.Connection, version: int) -> None:
    conn.execute(
        "INSERT INTO _schema_version (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version = ?",
        (version, version),
    )


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def _migrate_v1_initial_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS stock (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        market TEXT DEFAULT '',
        industry TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        analysis_date TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        stars INTEGER DEFAULT 1,
        action TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        indicators_json TEXT DEFAULT '',
        news_summary TEXT DEFAULT '',
        model TEXT DEFAULT '',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        cost_rmb REAL DEFAULT 0.0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS recommendation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recommend_date TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT DEFAULT '',
        rank INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        stars INTEGER DEFAULT 1,
        action TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        rule_score INTEGER DEFAULT 0,
        news_count INTEGER DEFAULT 0,
        close_price REAL DEFAULT 0.0,
        analysis_id INTEGER,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (analysis_id) REFERENCES analysis(id)
    );

    CREATE TABLE IF NOT EXISTS token_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        model TEXT DEFAULT '',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cache_hit_tokens INTEGER DEFAULT 0,
        cost_rmb REAL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS recommendation_run (
        run_id TEXT PRIMARY KEY,
        recommend_date TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        as_of_trade_date TEXT DEFAULT '',
        parameters_json TEXT DEFAULT '{}',
        budget_json TEXT DEFAULT '{}',
        filter_mode_json TEXT DEFAULT '{}',
        candidate_count INTEGER DEFAULT 0,
        analyzed_count INTEGER DEFAULT 0,
        recommendation_count INTEGER DEFAULT 0,
        failed_candidates_json TEXT DEFAULT '[]',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost_rmb REAL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS holdings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        buy_date TEXT NOT NULL,
        buy_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        current_price REAL DEFAULT 0.0,
        stop_loss REAL DEFAULT 0.0,
        take_profit REAL DEFAULT 0.0,
        ai_score_at_buy INTEGER DEFAULT 0,
        buy_reason TEXT DEFAULT '',
        status TEXT DEFAULT 'holding',
        sell_price REAL DEFAULT 0.0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        holding_id INTEGER,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        trade_type TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        reason TEXT DEFAULT '',
        pnl REAL DEFAULT 0.0,
        pnl_pct REAL DEFAULT 0.0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (holding_id) REFERENCES holdings(id)
    );

    CREATE TABLE IF NOT EXISTS recommendation_track (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        recommend_date TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT DEFAULT '',
        rank INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        entry_price REAL NOT NULL,
        entry_date TEXT NOT NULL,
        env_status TEXT DEFAULT '',
        env_score INTEGER DEFAULT 0,
        status TEXT DEFAULT 'open',
        latest_price REAL DEFAULT 0.0,
        latest_date TEXT DEFAULT '',
        exit_price REAL DEFAULT 0.0,
        exit_date TEXT DEFAULT '',
        pnl REAL DEFAULT 0.0,
        pnl_pct REAL DEFAULT 0.0,
        days_held INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(run_id, code)
    );

    CREATE TABLE IF NOT EXISTS daily_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        holding_id INTEGER,
        code TEXT NOT NULL,
        review_date TEXT NOT NULL,
        action TEXT DEFAULT '',
        score INTEGER DEFAULT 0,
        stars INTEGER DEFAULT 1,
        reason TEXT DEFAULT '',
        current_price REAL DEFAULT 0.0,
        pnl_pct REAL DEFAULT 0.0,
        token_usage TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (holding_id) REFERENCES holdings(id)
    );

    CREATE TABLE IF NOT EXISTS backtest_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT DEFAULT '',
        strategy_key TEXT NOT NULL,
        strategy_name TEXT DEFAULT '',
        days INTEGER DEFAULT 0,
        initial_cash REAL DEFAULT 0.0,
        final_cash REAL DEFAULT 0.0,
        total_pnl REAL DEFAULT 0.0,
        total_pnl_pct REAL DEFAULT 0.0,
        total_trades INTEGER DEFAULT 0,
        win_trades INTEGER DEFAULT 0,
        loss_trades INTEGER DEFAULT 0,
        win_rate REAL DEFAULT 0.0,
        max_drawdown_pct REAL DEFAULT 0.0,
        benchmark_return_pct REAL DEFAULT 0.0,
        params_json TEXT DEFAULT '{}',
        env_status TEXT DEFAULT '',
        env_score INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS candidate_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        recommend_date TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT DEFAULT '',
        rule_score INTEGER DEFAULT 0,
        passed_rules_json TEXT DEFAULT '[]',
        failed_rules_json TEXT DEFAULT '[]',
        llm_analyzed INTEGER DEFAULT 0,
        llm_score INTEGER DEFAULT 0,
        llm_action TEXT DEFAULT '',
        llm_reason TEXT DEFAULT '',
        status TEXT DEFAULT 'candidate',
        env_status TEXT DEFAULT '',
        env_score INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(run_id, code)
    );

    CREATE TABLE IF NOT EXISTS daily_job_log (
        day TEXT NOT NULL,
        job TEXT NOT NULL DEFAULT 'daily-backtest',
        status TEXT DEFAULT 'running',
        triggered_at TEXT DEFAULT (datetime('now', 'localtime')),
        finished_at TEXT DEFAULT '',
        detail TEXT DEFAULT '',
        PRIMARY KEY (day, job)
    );

    CREATE TABLE IF NOT EXISTS rule_params (
        key TEXT PRIMARY KEY,
        value REAL DEFAULT 0.0,
        value_str TEXT DEFAULT '',
        source TEXT DEFAULT 'manual',
        calibrated_on TEXT DEFAULT '',
        detail TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS strategy_params (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_key TEXT NOT NULL,
        params_json TEXT NOT NULL,
        source TEXT DEFAULT 'walkforward',
        consistency_pct REAL DEFAULT 0.0,
        avg_val_pnl_pct REAL DEFAULT 0.0,
        windows_total INTEGER DEFAULT 0,
        active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    """)


def _migrate_v2_recommendation_columns(conn: sqlite3.Connection) -> None:
    for col, default in [
        ("target_price", "0.0"),
        ("stop_loss_price", "0.0"),
        ("agent_details_json", "'[]'"),
        ("prompt_tokens", "0"),
        ("completion_tokens", "0"),
        ("total_tokens", "0"),
        ("cost_rmb", "0.0"),
        ("passed_rules_json", "'[]'"),
        ("failed_rules_json", "'[]'"),
        ("run_id", "''"),
        ("trade_date", "''"),
        ("analysis_status", "'complete'"),
        ("analysis_warnings_json", "'[]'"),
    ]:
        if not _column_exists(conn, "recommendation", col):
            conn.execute(f"ALTER TABLE recommendation ADD COLUMN {col} TEXT DEFAULT {default}")


def _migrate_v3_holdings_sell_price(conn: sqlite3.Connection) -> None:
    if not _column_exists(conn, "holdings", "sell_price"):
        conn.execute("ALTER TABLE holdings ADD COLUMN sell_price REAL DEFAULT 0.0")


def _migrate_v4_daily_reviews_suggested(conn: sqlite3.Connection) -> None:
    if not _column_exists(conn, "daily_reviews", "suggested_hold_days"):
        conn.execute("ALTER TABLE daily_reviews ADD COLUMN suggested_hold_days INTEGER")
    if not _column_exists(conn, "daily_reviews", "suggested_sell_price"):
        conn.execute("ALTER TABLE daily_reviews ADD COLUMN suggested_sell_price REAL")


def _migrate_v5_backtest_runs_params(conn: sqlite3.Connection) -> None:
    if not _column_exists(conn, "backtest_runs", "params_json"):
        conn.execute("ALTER TABLE backtest_runs ADD COLUMN params_json TEXT DEFAULT '{}'")
    if not _column_exists(conn, "backtest_runs", "env_status"):
        conn.execute("ALTER TABLE backtest_runs ADD COLUMN env_status TEXT DEFAULT ''")
    if not _column_exists(conn, "backtest_runs", "env_score"):
        conn.execute("ALTER TABLE backtest_runs ADD COLUMN env_score INTEGER DEFAULT 0")


def init_db() -> None:
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS _schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("INSERT OR IGNORE INTO _schema_version (id, version) VALUES (1, 0)")

        current = _get_schema_version(conn)
        migrations = [
            _migrate_v1_initial_schema,
            _migrate_v2_recommendation_columns,
            _migrate_v3_holdings_sell_price,
            _migrate_v4_daily_reviews_suggested,
            _migrate_v5_backtest_runs_params,
        ]
        for target, migrate in enumerate(migrations, start=1):
            if current < target:
                migrate(conn)
                _set_schema_version(conn, target)

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_recommendation_run_date "
            "ON recommendation_run (recommend_date, generated_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_recommendation_run_id "
            "ON recommendation (run_id, rank)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_track_status "
            "ON recommendation_track (status, recommend_date)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy "
            "ON backtest_runs (strategy_key, created_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_candidate_log_date "
            "ON candidate_log (recommend_date, status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_strategy_params_active "
            "ON strategy_params (strategy_key, active, created_at DESC)"
        )
        conn.commit()
