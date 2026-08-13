"""每日完整流程编排"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import List

from app.db import get_connection
from app.schemas.portfolio import DailyReviewResult, DailyRoutineResponse
from app.schemas.usage import TokenUsage
from app.services.ai_service import analyze_stock
from app.services.indicator_service import get_indicator_snapshot
from app.services.news_service import build_news_summary, get_stock_news_bundle
from app.services.notify_service import send_daily_report_message
from app.services.portfolio_service import (
    ensure_tables,
    list_holdings,
    update_current_prices,
)
from app.services.recommend_service import build_recommendations
from app.services.stock_service import get_kline
from app.services.usage_service import build_token_usage


def run_daily_routine() -> DailyRoutineResponse:
    ensure_tables()
    today = date.today().isoformat()
    total_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost_rmb": 0.0}

    # Step 1: Review all holdings
    holdings_list = list_holdings(status="holding")
    reviews: List[DailyReviewResult] = []

    for holding in holdings_list.items:
        try:
            # Update current price
            kline = get_kline(holding.code, days=5)
            if not kline.empty:
                latest_price = float(kline.iloc[-1]["close"])
                update_current_prices(holding.code, latest_price)
            else:
                latest_price = holding.current_price

            # Build a basic analysis
            indicators = get_indicator_snapshot(holding.code, days=80, name=holding.name)
            if indicators:
                from app.services.ai_service import analyze_holding
                news_bundle = get_stock_news_bundle(holding.code, holding.name)
                news_summary = build_news_summary(news_bundle)
                pnl_pct_val = round((latest_price - holding.buy_price) / holding.buy_price * 100, 2)

                result = analyze_holding(
                    indicators,
                    news_summary=news_summary,
                    buy_price=holding.buy_price,
                    current_price=latest_price,
                    pnl_pct=pnl_pct_val,
                    holding_days=holding.days_held or 0,
                    stop_loss=holding.stop_loss or 0,
                    take_profit=holding.take_profit or 0,
                )

                # Record daily review
                conn = get_connection()
                try:
                    conn.execute(
                        """INSERT INTO daily_reviews (holding_id, code, review_date, action,
                           score, stars, reason, current_price, pnl_pct, token_usage,
                           suggested_sell_price)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (holding.id, holding.code, today, result.action, result.score,
                         result.stars, result.reason, latest_price, pnl_pct_val,
                         json.dumps(result.token_usage.model_dump() if result.token_usage else {}),
                         result.suggested_sell_price),
                    )
                    conn.commit()
                finally:
                    conn.close()

                # Track token usage
                if result.token_usage:
                    token_usage = result.token_usage
                    total_token_usage["prompt_tokens"] += token_usage.prompt_tokens
                    total_token_usage["completion_tokens"] += token_usage.completion_tokens
                    total_token_usage["total_tokens"] += token_usage.total_tokens
                    total_token_usage["cost_rmb"] += token_usage.cost_rmb

                reviews.append(DailyReviewResult(
                    holding_id=holding.id,
                    code=holding.code,
                    name=holding.name,
                    action=result.action,
                    score=result.score,
                    stars=result.stars,
                    reason=result.reason[:100],
                    current_price=latest_price,
                    pnl_pct=pnl_pct_val,
                    suggested_sell_price=result.suggested_sell_price,
                ))
        except Exception:
            continue

    # Step 2: Scan new candidates
    try:
        report = build_recommendations(candidate_limit=10, top_n=5, min_rule_score=60)
        new_candidates = report.candidate_count
        new_recommendations = report.count
        if report.usage_summary:
            total_token_usage["prompt_tokens"] += report.usage_summary.prompt_tokens
            total_token_usage["completion_tokens"] += report.usage_summary.completion_tokens
            total_token_usage["total_tokens"] += report.usage_summary.total_tokens
            total_token_usage["cost_rmb"] += report.usage_summary.cost_rmb
    except Exception:
        new_candidates = 0
        new_recommendations = 0

    # Step 2.5: Persist today's recommendations to DB
    if new_recommendations > 0:
        try:
            conn = get_connection()
            conn.execute("DELETE FROM recommendation WHERE recommend_date = ?", (today,))
            for item in report.recommendations:
                agent_json = json.dumps([a.model_dump() for a in item.agent_details], ensure_ascii=False)
                tu = item.token_usage or TokenUsage()
                conn.execute(
                    """INSERT INTO recommendation
                       (recommend_date, code, name, rank, score, stars, action, reason,
                        rule_score, news_count, close_price, target_price, stop_loss_price,
                        agent_details_json, prompt_tokens, completion_tokens, total_tokens, cost_rmb)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (today, item.code, item.name, item.rank, item.score, item.stars,
                     item.action, item.reason, item.rule_score, item.news_count,
                     item.close_price, item.target_price, item.stop_loss_price,
                     agent_json, tu.prompt_tokens, tu.completion_tokens, tu.total_tokens, tu.cost_rmb),
                )
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()

    total_token_usage["cost_rmb"] = round(total_token_usage["cost_rmb"], 6)

    # Step 3: Build recommendation details for notification
    rec_details = []
    if new_recommendations > 0:
        try:
            rec_details = [
                {
                    "code": r.code,
                    "name": r.name,
                    "price": r.close_price or 0,
                    "score": r.score,
                    "action": r.action,
                    "reason": r.reason,
                }
                for r in report.recommendations
            ]
        except Exception:
            rec_details = []

    # Step 4: Send notification
    try:
        send_daily_report_message(
            date_str=today,
            holdings_count=len(reviews),
            recommendations_count=new_recommendations,
            candidate_count=new_candidates,
            total_cost=total_token_usage["cost_rmb"],
            recommendations=rec_details,
        )
    except Exception:
        pass

    return DailyRoutineResponse(
        date=today,
        holdings_reviewed=len(reviews),
        new_candidates=new_candidates,
        new_recommendations=new_recommendations,
        total_token_usage=total_token_usage,
        reviews=reviews,
    )
