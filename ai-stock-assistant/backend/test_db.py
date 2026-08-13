import sqlite3
conn = sqlite3.connect("data/ai_stock.db")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for (name,) in tables:
    (count,) = conn.execute(f"SELECT count(*) FROM [{name}]").fetchone()
    print(f"{name}: {count} 条")
conn.close()
