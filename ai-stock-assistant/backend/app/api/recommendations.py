import asyncio
import json
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException

import app.config as cfg
from app.db import get_connection
from app.schemas.stock import AgentDetail, CandidateFailure, RecommendationItem, RecommendationReport
from app.schemas.usage import TokenUsage
from app.services.market_service import assess_market_environment
from app.services.recommend_service import build_recommendations, persist_recommendation_report

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _loads(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def _usage_from_row(row) -> TokenUsage:
    return TokenUsage(
        prompt_tokens=int(row["prompt_tokens"] or 0),
        completion_tokens=int(row["completion_tokens"] or 0),
        total_tokens=int(row["total_tokens"] or 0),
        cost_rmb=float(row["cost_rmb"] or 0.0),
        model=cfg.OPENAI_MODEL,
    )


def _build_report_from_rows(rows: list, run) -> RecommendationReport:
    parameters = _loads(run["parameters_json"], {})
    recommendations = []
    for row in rows:
        agent_details = [AgentDetail(**item) for item in _loads(row["agent_details_json"], [])]
        recommendations.append(RecommendationItem(
            rank=row["rank"],
            code=row["code"],
            name=row["name"],
            close_price=row["close_price"],
            score=row["score"],
            stars=row["stars"],
            action=row["action"],
            reason=row["reason"],
            rule_score=row["rule_score"],
            passed_rules=_loads(row["passed_rules_json"], []),
            failed_rules=_loads(row["failed_rules_json"], []),
            news_count=row["news_count"],
            target_price=row["target_price"],
            stop_loss_price=row["stop_loss_price"],
            agent_details=agent_details,
            token_usage=_usage_from_row(row),
            trade_date=row["trade_date"] or None,
            analysis_status=row["analysis_status"] or "complete",
            analysis_warnings=_loads(row["analysis_warnings_json"], []),
        ))

    return RecommendationReport(
        date=run["recommend_date"],
        run_id=run["run_id"],
        generated_at=run["generated_at"],
        as_of_trade_date=run["as_of_trade_date"] or None,
        parameters=parameters,
        budget=_loads(run["budget_json"], {}),
        filter_mode=_loads(run["filter_mode_json"], {}),
        candidate_count=run["candidate_count"],
        analyzed_count=run["analyzed_count"],
        count=run["recommendation_count"],
        usage_summary=_usage_from_row(run),
        recommendations=recommendations,
        failed_candidates=[CandidateFailure(**item) for item in _loads(run["failed_candidates_json"], [])],
        env_status=parameters.get("env_status"),
        env_score=parameters.get("env_score"),
        paper_mode=parameters.get("env_status") == "unsuitable",
    )


def _empty_report() -> RecommendationReport:
    return RecommendationReport(
        date=date.today().isoformat(),
        filter_mode={},
        candidate_count=0,
        analyzed_count=0,
        count=0,
        usage_summary=TokenUsage(),
        recommendations=[],
    )


def _persist_report(report: RecommendationReport) -> None:
    persist_recommendation_report(report)


@router.get("/today", response_model=RecommendationReport)
async def get_today_recommendations(
    run_id: Optional[str] = None,
    candidate_limit: Optional[int] = None,
    top_n: Optional[int] = None,
    min_rule_score: Optional[int] = None,
):
    conn = get_connection()
    try:
        if run_id:
            run = conn.execute(
                "SELECT * FROM recommendation_run WHERE run_id = ?", (run_id,)
            ).fetchone()
        elif all(v is not None for v in (candidate_limit, top_n, min_rule_score)):
            run = conn.execute(
                """SELECT * FROM recommendation_run
                   WHERE recommend_date = ?
                     AND json_extract(parameters_json, '$.candidate_limit') = ?
                     AND json_extract(parameters_json, '$.top_n') = ?
                     AND json_extract(parameters_json, '$.min_rule_score') = ?
                   ORDER BY generated_at DESC LIMIT 1""",
                (date.today().isoformat(), candidate_limit, top_n, min_rule_score),
            ).fetchone()
        else:
            run = conn.execute(
                """SELECT * FROM recommendation_run
                   WHERE recommend_date = ? ORDER BY generated_at DESC LIMIT 1""",
                (date.today().isoformat(),),
            ).fetchone()
        if not run:
            return _empty_report()
        rows = conn.execute(
            "SELECT * FROM recommendation WHERE run_id = ? ORDER BY rank",
            (run["run_id"],),
        ).fetchall()
        return _build_report_from_rows(rows, run)
    finally:
        conn.close()


@router.post("/today", response_model=RecommendationReport)
async def refresh_today_recommendations(
    candidate_limit: int = 10,
    top_n: int = 5,
    min_rule_score: int = 60,
):
    env = assess_market_environment()
    try:
        report = await asyncio.wait_for(
            asyncio.to_thread(
                build_recommendations,
                candidate_limit=candidate_limit,
                top_n=top_n,
                min_rule_score=min_rule_score,
                env_status=env.get("status"),
                env_score=env.get("score"),
            ),
            timeout=cfg.RECOMMENDATION_RUN_TIMEOUT_SECONDS + 5,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="recommendation run exceeded its time budget")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    report.env_status = env.get("status")
    report.env_score = env.get("score")
    report.paper_mode = env.get("status") == "unsuitable"
    report.parameters["env_status"] = env.get("status")
    report.parameters["env_score"] = env.get("score")

    try:
        await asyncio.to_thread(_persist_report, report)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"recommendation persistence failed: {exc}")
    return report
