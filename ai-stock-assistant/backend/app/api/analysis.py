import logging

from pydantic import BaseModel

from fastapi import APIRouter, HTTPException

from app.agents.orchestrator import run_agent_pipeline
from app.schemas.stock import AgentDetail
from app.services.indicator_service import get_indicator_snapshot
from app.services.news_service import build_news_summary, get_stock_news_bundle
from app.services.recommend_service import build_recommendations
from app.services.rule_engine import evaluate_stock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])


class SingleAnalysisRequest(BaseModel):
    code: str
    name: str = ""
    days: int = 60
    with_news: bool = True


class BatchAnalysisRequest(BaseModel):
    candidate_limit: int = 10
    top_n: int = 5
    min_rule_score: int = 60


@router.post("/single")
def single_analysis(req: SingleAnalysisRequest):
    try:
        indicators = get_indicator_snapshot(req.code, days=req.days, name=req.name or None)
        if not indicators:
            raise HTTPException(status_code=404, detail=f"股票 {req.code} 数据获取失败")

        news_summary = ""
        if req.with_news:
            bundle = get_stock_news_bundle(req.code, indicators.name)
            news_summary = build_news_summary(bundle)

        pipeline = run_agent_pipeline(req.code, indicators.name, indicators, news_summary)
        score_100 = pipeline.score * 10
        stars = max(1, min(5, round(pipeline.score / 2)))

        rule_candidate = evaluate_stock(req.code, indicators.name, days=req.days)
        rule_score = rule_candidate.rule_score if rule_candidate else None
        passed_rules = rule_candidate.passed_rules if rule_candidate else []
        failed_rules = rule_candidate.failed_rules if rule_candidate else []

        return {
            "code": req.code,
            "name": indicators.name,
            "score": score_100,
            "stars": stars,
            "action": pipeline.action,
            "reason": pipeline.reason,
            "close_price": indicators.close,
            "passes_price_filter": None,
            "token_usage": pipeline.combined_usage,
            "rule_score": rule_score,
            "passed_rules": passed_rules,
            "failed_rules": failed_rules,
            "agent_details": [
                AgentDetail(
                    name="news",
                    label="NewsAgent",
                    stars=pipeline.news_result.stars,
                    signal=pipeline.news_result.signal,
                    summary=pipeline.news_result.summary,
                    details=pipeline.news_result.details,
                ),
                AgentDetail(
                    name="technical",
                    label="TechnicalAgent",
                    stars=pipeline.technical_result.stars,
                    signal=pipeline.technical_result.signal,
                    summary=pipeline.technical_result.summary,
                    details=pipeline.technical_result.details,
                ),
                AgentDetail(
                    name="risk",
                    label="RiskAgent",
                    stars=pipeline.risk_result.stars,
                    signal=pipeline.risk_result.signal,
                    summary=pipeline.risk_result.summary,
                    details=pipeline.risk_result.details,
                ),
            ],
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("单股分析失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/batch")
def batch_analysis(req: BatchAnalysisRequest):
    try:
        report = build_recommendations(
            candidate_limit=req.candidate_limit,
            top_n=req.top_n,
            min_rule_score=req.min_rule_score,
        )
        return report
    except Exception:
        logger.exception("批量分析失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")
