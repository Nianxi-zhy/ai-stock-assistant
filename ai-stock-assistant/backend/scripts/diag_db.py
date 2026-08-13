"""手动诊断脚本，非自动化测试（直接连接真实数据库 data/ai_stock.db，勿纳入 pytest）。"""
import sqlite3
conn = sqlite3.connect("data/ai_stock.db")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for (name,) in tables:
    (count,) = conn.execute(f"SELECT count(*) FROM [{name}]").fetchone()
    print(f"{name}: {count} 条")
conn.close()
