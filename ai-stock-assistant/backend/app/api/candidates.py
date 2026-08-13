"""候选记录查询 — 对照 LLM 推荐 vs 规则选中的增量价值"""
from fastapi import APIRouter

from app.db import get_connection

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("")
def get_candidates(days: int = 30):
    """最近 N 天规则候选记录 + 汇总统计（LLM 分析 vs 未分析的对照组基线）。"""
    if days <= 0:
        days = 30
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM candidate_log
               WHERE recommend_date >= date('now', ?)
               ORDER BY recommend_date DESC, rule_score DESC, id""",
            (f"-{days} day",),
        ).fetchall()
    finally:
        conn.close()

    items = [
        {
            "code": r["code"],
            "name": r["name"],
            "date": r["recommend_date"],
            "rule_score": r["rule_score"],
            "llm_score": r["llm_score"],
            "llm_action": r["llm_action"],
            "llm_reason": r["llm_reason"],
            "status": r["status"],
            "env_status": r["env_status"],
            "env_score": r["env_score"],
        }
        for r in rows
    ]
    total = len(items)
    llm_analyzed = sum(1 for r in rows if r["llm_analyzed"])
    llm_buy = sum(1 for r in rows if r["status"] == "llm_buy")
    llm_rejected = sum(1 for r in rows if r["status"] == "llm_rejected")
    buy_rate = round(llm_buy / llm_analyzed * 100, 1) if llm_analyzed else 0.0
    return {
        "items": items,
        "stats": {
            "total_candidates": total,
            "llm_analyzed": llm_analyzed,
            "llm_buy": llm_buy,
            "llm_rejected": llm_rejected,
            "buy_rate": buy_rate,
        },
    }
