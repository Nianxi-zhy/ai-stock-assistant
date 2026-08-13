"""SQLite 数据库连接与建表"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ai_stock.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def insert_token_log(model: str, prompt_tokens: int, completion_tokens: int, cache_hit_tokens: int) -> None:
    total = prompt_tokens + completion_tokens
    from app.services.usage_service import calculate_cost_rmb
    cost = calculate_cost_rmb(prompt_tokens, completion_tokens, model, cache_hit_tokens)
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO token_log (model, prompt_tokens, completion_tokens, total_tokens, cache_hit_tokens, cost_rmb)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (model, prompt_tokens, completion_tokens, total, cache_hit_tokens, cost),
        )
        conn.commit()
    finally:
        conn.close()


def _migrate_recommendation(conn: sqlite3.Connection) -> None:
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
        try:
            conn.execute(f"ALTER TABLE recommendation ADD COLUMN {col} TEXT DEFAULT {default}")
        except sqlite3.OperationalError:
            pass


def _migrate_holdings(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE holdings ADD COLUMN sell_price REAL DEFAULT 0.0")
    except sqlite3.OperationalError:
        pass


def _migrate_daily_reviews(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE daily_reviews ADD COLUMN suggested_hold_days INTEGER")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE daily_reviews ADD COLUMN suggested_sell_price REAL")
    except sqlite3.OperationalError:
        pass


def _migrate_backtest_runs(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE backtest_runs ADD COLUMN params_json TEXT DEFAULT '{}'")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE backtest_runs ADD COLUMN env_status TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE backtest_runs ADD COLUMN env_score INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass


def init_db() -> None:
    conn = get_connection()
    try:
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
        _migrate_recommendation(conn)
        _migrate_holdings(conn)
        _migrate_daily_reviews(conn)
        _migrate_backtest_runs(conn)
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
    finally:
        conn.close()
