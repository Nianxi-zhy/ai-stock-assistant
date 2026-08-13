"""app.db 可隔离逻辑单元测试。

所有涉及磁盘的用例均通过 monkeypatch DB_PATH 指向 tmp_path 临时库，
绝不触碰 backend/data/ 下的真实 ai_stock.db。
"""
import sqlite3

import pytest

import app.db as db


@pytest.fixture
def mem_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


@pytest.fixture
def tmp_db(monkeypatch, tmp_path):
    """把 DB_PATH 指到临时目录，并保证线程局部连接干净。

    注意：app/db.py:85 的 _all_connections(WeakSet).add(sqlite3.Connection)
    在 Python 3.12 下会抛 TypeError（sqlite3.Connection 不支持弱引用），
    属源码 bug（见测试报告）。此处用普通 set 替换以隔离该缺陷，不改动源码。
    """
    db.close_connection()
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(db, "_all_connections", set())
    yield tmp_path / "test.db"
    db.close_connection()


class TestSchemaHelpers:
    def test_column_exists(self, mem_conn):
        mem_conn.execute("CREATE TABLE t (a INTEGER, b TEXT)")
        assert db._column_exists(mem_conn, "t", "a") is True
        assert db._column_exists(mem_conn, "t", "nope") is False

    def test_schema_version_roundtrip(self, mem_conn):
        mem_conn.execute(
            "CREATE TABLE _schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER)"
        )
        assert db._get_schema_version(mem_conn) == 0
        db._set_schema_version(mem_conn, 3)
        assert db._get_schema_version(mem_conn) == 3
        # 重复设置走 ON CONFLICT 更新而非插入
        db._set_schema_version(mem_conn, 5)
        assert db._get_schema_version(mem_conn) == 5
        assert mem_conn.execute("SELECT count(*) FROM _schema_version").fetchone()[0] == 1


class TestPooledConnection:
    def test_close_is_soft_and_rolls_back(self, mem_conn):
        raw = mem_conn
        pooled = db._PooledConnection(raw)
        raw.execute("CREATE TABLE t (a INTEGER)")
        raw.execute("INSERT INTO t VALUES (1)")  # 未提交
        pooled.close()  # 软关闭：rollback + 连接仍可用
        assert raw.execute("SELECT count(*) FROM t").fetchone()[0] == 0
        raw.execute("SELECT 1")  # 底层连接未真正关闭

    def test_attribute_passthrough(self, mem_conn):
        pooled = db._PooledConnection(mem_conn)
        assert pooled.execute("SELECT 1").fetchone()[0] == 1


class TestGetConnection:
    def test_creates_db_file_and_reuses_connection(self, tmp_db):
        c1 = db.get_connection()
        assert tmp_db.exists()
        c2 = db.get_connection()
        assert c1._conn is c2._conn  # 线程内复用同一底层连接
        # 初始化参数生效
        assert c2.execute("PRAGMA foreign_keys").fetchone()[0] == 1

    def test_stale_connection_rebuilt(self, tmp_db):
        c1 = db.get_connection()
        c1._conn.close()  # 外部强制关闭底层连接
        c2 = db.get_connection()
        assert c2._conn is not c1._conn
        assert c2.execute("SELECT 1").fetchone()[0] == 1


class TestInitDb:
    def test_creates_tables_and_is_idempotent(self, tmp_db):
        db.init_db()
        db.init_db()  # 第二次调用不应报错（幂等）
        conn = db.get_connection()
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        for expected in ("stock", "analysis", "recommendation", "token_log",
                         "holdings", "trades", "rule_params", "candidate_log"):
            assert expected in tables
        assert db._get_schema_version(conn) == 5

    def test_migration_adds_recommendation_columns(self, tmp_db):
        db.init_db()
        conn = db.get_connection()
        for col in ("target_price", "run_id", "analysis_status"):
            assert db._column_exists(conn, "recommendation", col)
