from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

import app.config as cfg
from app.db import get_connection

router = APIRouter(prefix="/usage", tags=["usage"])


class DailyUsage(BaseModel):
    date: str
    call_count: int
    total_tokens: int
    cache_hit_tokens: int
    cost_rmb: float


class TokenTotalResponse(BaseModel):
    cumulative_prompt_tokens: int
    cumulative_completion_tokens: int
    cumulative_total_tokens: int
    cumulative_cache_hit_tokens: int
    cumulative_cost_rmb: float
    total_calls: int
    model: str
    daily_usage: list[DailyUsage]
    latest_run: Optional[DailyUsage]


@router.get("/total", response_model=TokenTotalResponse)
async def get_token_total():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT date(created_at) as d, prompt_tokens, completion_tokens, total_tokens, cache_hit_tokens, cost_rmb "
            "FROM token_log ORDER BY created_at DESC"
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return TokenTotalResponse(
            cumulative_prompt_tokens=0,
            cumulative_completion_tokens=0,
            cumulative_total_tokens=0,
            cumulative_cache_hit_tokens=0,
            cumulative_cost_rmb=0.0,
            total_calls=0,
            model="",
            daily_usage=[],
            latest_run=None,
        )

    by_date: dict[str, dict] = {}
    cum_prompt = 0
    cum_completion = 0
    cum_total = 0
    cum_cache = 0
    cum_cost = 0.0
    call_count = 0

    model = cfg.OPENAI_MODEL

    for r in rows:
        d = r["d"]
        pt = int(r["prompt_tokens"] or 0)
        ct = int(r["completion_tokens"] or 0)
        tt = int(r["total_tokens"] or 0)
        ch = int(r["cache_hit_tokens"] or 0)
        cr = float(r["cost_rmb"] or 0.0)

        cum_prompt += pt
        cum_completion += ct
        cum_total += tt
        cum_cache += ch
        cum_cost += cr
        call_count += 1

        if d not in by_date:
            by_date[d] = {"prompt": 0, "completion": 0, "total": 0, "cache": 0, "cost": 0.0, "count": 0}
        by_date[d]["prompt"] += pt
        by_date[d]["completion"] += ct
        by_date[d]["total"] += tt
        by_date[d]["cache"] += ch
        by_date[d]["cost"] += cr
        by_date[d]["count"] += 1

    daily_usage = [
        DailyUsage(
            date=d,
            call_count=v["count"],
            total_tokens=v["total"],
            cache_hit_tokens=v["cache"],
            cost_rmb=round(v["cost"], 6),
        )
        for d, v in sorted(by_date.items(), reverse=True)
    ]

    latest = daily_usage[0] if daily_usage else None

    return TokenTotalResponse(
        cumulative_prompt_tokens=cum_prompt,
        cumulative_completion_tokens=cum_completion,
        cumulative_total_tokens=cum_total,
        cumulative_cache_hit_tokens=cum_cache,
        cumulative_cost_rmb=round(cum_cost, 6),
        total_calls=call_count,
        model=model,
        daily_usage=daily_usage,
        latest_run=latest,
    )
