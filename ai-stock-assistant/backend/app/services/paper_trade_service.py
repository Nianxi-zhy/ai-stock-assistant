"""纸面跟踪：推荐票模拟买入/结算，与真实持仓（trades 表）完全隔离。

推荐生成时记录当时的大盘环境评分；观察期结束后按最新价模拟卖出，
据此统计弱市环境下的推荐质量（弱市胜率），用于验证系统在差环境下的表现。
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta

from app.db import get_connection

# 观察期（交易日数），可在 .env 中覆盖
OBSERVATION_TRADING_DAYS = int(os.getenv("PAPER_OBSERVATION_DAYS", "10"))
# 从最近多少天的推荐里同步跟踪
SYNC_LOOKBACK_DAYS = int(os.getenv("PAPER_SYNC_LOOKBACK_DAYS", "30"))


def _trading_days_between(start: str, end: str) -> int:
    try:
        d0 = datetime.strptime(start, "%Y-%m-%d").date()
        d1 = datetime.strptime(end, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return 0
    if d1 < d0:
        return 0
    return sum(1 for i in range((d1 - d0).days + 1) if (d0 + timedelta(days=i)).weekday() < 5)


def _stock_market_prefix(code: str) -> str:
    """股票视角的市场前缀：000001 是平安银行(sz)，不是上证指数(sh)。
    不能走 stock_service._tencent_market —— 那是为指数(大盘环境)设计的映射。"""
    return "sh" if code.startswith("6") else "sz"


def _latest_known_price(code: str) -> tuple[float, str]:
    """优先实时价，失败则用最近一根K线收盘价。"""
    try:
        import requests
        resp = requests.get(
            f"https://web.sqt.gtimg.cn/q={_stock_market_prefix(code)}{code}",
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )
        text = resp.text.strip()
        if text and "=" in text:
            parts = text.split('"')[1].split("~")
            if len(parts) > 3:
                price = float(parts[3])
                if price > 0:
                    return price, date.today().isoformat()
    except Exception:
        pass
    try:
        import akshare as ak
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=15)).strftime("%Y%m%d")
        raw = ak.stock_zh_a_hist(
            symbol=code.zfill(6), period="daily", start_date=start, end_date=end, adjust="qfq"
        )
        if raw is not None and not raw.empty:
            row = raw.iloc[-1]
            return float(row["收盘"]), str(row["日期"])
    except Exception:
        pass
    return 0.0, ""


def sync_from_recommendations() -> int:
    """把近期推荐中尚未跟踪的票补入跟踪表（按 run_id+code 去重）。"""
    conn = get_connection()
    inserted = 0
    try:
        runs = conn.execute(
            """SELECT run_id, recommend_date, parameters_json FROM recommendation_run
               WHERE recommend_date >= date('now', ?)
               ORDER BY recommend_date DESC, generated_at DESC""",
            (f"-{SYNC_LOOKBACK_DAYS} day",),
        ).fetchall()
        for run in runs:
            params = _loads(run["parameters_json"], {})
            env_status = str(params.get("env_status", ""))
            env_score = int(params.get("env_score", 0) or 0)
            rows = conn.execute(
                "SELECT code, name, rank, score, close_price, trade_date FROM recommendation "
                "WHERE run_id = ? ORDER BY rank",
                (run["run_id"],),
            ).fetchall()
            for r in rows:
                if conn.execute(
                    "SELECT id FROM recommendation_track WHERE recommend_date = ? AND code = ?",
                    (run["recommend_date"], r["code"]),
                ).fetchone():
                    continue
                entry_price = r["close_price"] or 0
                entry_date = r["trade_date"] or run["recommend_date"]
                if entry_price <= 0:
                    continue
                conn.execute(
                    """INSERT INTO recommendation_track
                       (run_id, recommend_date, code, name, rank, score,
                        entry_price, entry_date, env_status, env_score)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (run["run_id"], run["recommend_date"], r["code"], r["name"],
                     r["rank"], r["score"], entry_price, entry_date, env_status, env_score),
                )
                inserted += 1
        conn.commit()
        return inserted
    finally:
        conn.close()


def _loads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def update_and_settle() -> dict:
    """刷新在途跟踪的最新价；观察期到期的按最新价模拟卖出并结算盈亏。"""
    synced = sync_from_recommendations()
    conn = get_connection()
    updated = 0
    settled = 0
    try:
        rows = conn.execute(
            "SELECT * FROM recommendation_track WHERE status = 'open'"
        ).fetchall()
        for r in rows:
            price, latest_date = _latest_known_price(r["code"])
            if price <= 0:
                continue
            conn.execute(
                "UPDATE recommendation_track SET latest_price = ?, latest_date = ? WHERE id = ?",
                (price, latest_date, r["id"]),
            )
            updated += 1
            days = _trading_days_between(r["entry_date"], latest_date)
            if days >= OBSERVATION_TRADING_DAYS:
                entry_price = r["entry_price"]
                pnl = price - entry_price
                pnl_pct = pnl / entry_price * 100 if entry_price > 0 else 0.0
                conn.execute(
                    """UPDATE recommendation_track
                       SET status = 'closed', exit_price = ?, exit_date = ?,
                           pnl = ?, pnl_pct = ?, days_held = ?
                       WHERE id = ?""",
                    (price, latest_date, round(pnl, 2), round(pnl_pct, 2), days, r["id"]),
                )
                settled += 1
        conn.commit()
        return {"synced": synced, "updated": updated, "settled": settled}
    finally:
        conn.close()


def list_tracked() -> dict:
    """返回跟踪列表 + 汇总统计（含按推荐时环境分组的弱市表现）。"""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM recommendation_track ORDER BY recommend_date DESC, rank"
        ).fetchall()
        items = [dict(r) for r in rows]
        closed = [r for r in rows if r["status"] == "closed"]
        win_count = sum(1 for r in closed if r["pnl_pct"] > 0)

        env_breakdown: dict[str, dict] = {}
        for r in closed:
            key = r["env_status"] or "unknown"
            st = env_breakdown.setdefault(key, {"count": 0, "win": 0, "total_pnl_pct": 0.0})
            st["count"] += 1
            st["win"] += 1 if r["pnl_pct"] > 0 else 0
            st["total_pnl_pct"] += r["pnl_pct"]
        for st in env_breakdown.values():
            st["win_rate"] = round(st["win"] / st["count"] * 100, 1) if st["count"] else 0.0
            st["avg_pnl_pct"] = round(st["total_pnl_pct"] / st["count"], 2) if st["count"] else 0.0
            st.pop("total_pnl_pct", None)

        stats = {
            "total": len(items),
            "open": sum(1 for r in rows if r["status"] == "open"),
            "closed": len(closed),
            "win_count": win_count,
            "win_rate": round(win_count / max(len(closed), 1) * 100, 1),
            "avg_pnl_pct": round(sum(r["pnl_pct"] for r in closed) / max(len(closed), 1), 2),
            "env_breakdown": env_breakdown,
        }
        return {"items": items, "stats": stats}
    finally:
        conn.close()
