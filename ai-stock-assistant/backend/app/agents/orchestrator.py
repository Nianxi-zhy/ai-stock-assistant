"""Agent 编排 — 统一的多 Agent 分析管线"""
from __future__ import annotations

from typing import List, Optional

from app.agents.base import AgentResult
from app.agents.decision_agent import run_decision_agent
from app.agents.fundamental_agent import run_fundamental_agent
from app.agents.news_agent import run_news_agent
from app.agents.risk_agent import run_risk_agent
from app.agents.technical_agent import run_technical_agent
from app.schemas.stock import IndicatorSnapshot
from app.schemas.usage import TokenUsage
from app.services.indicator_service import build_indicator_explanation
from app.services.usage_service import build_token_usage


def _empty_usage() -> TokenUsage:
    return build_token_usage(prompt_tokens=0, completion_tokens=0, model="")


def build_indicator_text(ind: IndicatorSnapshot) -> str:
    ind_expl = ind.indicator_explanation or build_indicator_explanation(ind)
    return (
        f"价格：{ind.close:.2f}  成交量：{ind.volume:.0f}\n"
        f"MA5：{ind.ma5:.2f}  MA20：{ind.ma20:.2f}  MA60：{ind.ma60:.2f}\n"
        f"MACD：DIF={ind.macd_dif:.4f} DEA={ind.macd_dea:.4f} 信号={ind.macd_signal}\n"
        f"RSI：{ind.rsi:.2f} ({ind.rsi_signal})\n"
        f"BOLL：上={ind.boll_upper:.2f} 中={ind.boll_mid:.2f} 下={ind.boll_lower:.2f}\n"
        f"{ind_expl}"
    )


class AgentPipelineResult:
    """多 Agent 管线输出"""

    def __init__(
        self,
        news_result: AgentResult,
        technical_result: AgentResult,
        risk_result: AgentResult,
        fundamental_result: AgentResult,
        score: int,
        action: str,
        reason: str,
        agent_weights: str,
        combined_usage: TokenUsage,
        analysis_warnings: List[str],
    ):
        self.news_result = news_result
        self.technical_result = technical_result
        self.risk_result = risk_result
        self.fundamental_result = fundamental_result
        self.score = score
        self.action = action
        self.reason = reason
        self.agent_weights = agent_weights
        self.combined_usage = combined_usage
        self.analysis_warnings = analysis_warnings

    @property
    def agents(self) -> List[AgentResult]:
        return [self.news_result, self.technical_result, self.risk_result, self.fundamental_result]


def run_agent_pipeline(
    code: str,
    name: str,
    indicators: IndicatorSnapshot,
    news_summary: str = "",
) -> AgentPipelineResult:
    """对一只股票运行完整的多 Agent 管线。"""
    indicator_text = build_indicator_text(indicators)
    kline_summary = indicators.kline_summary

    news_result = run_news_agent(code, name, news_summary)
    technical_result = run_technical_agent(code, name, kline_summary, indicator_text)
    risk_result = run_risk_agent(code, name, kline_summary, indicator_text, indicators.close)
    fundamental_result = run_fundamental_agent(code, name, indicators.fundamental_summary, indicators.fundamental_score)

    score, action, reason, weights = run_decision_agent(
        code, name, news_result, technical_result, risk_result, fundamental_result,
    )

    combined_usage = _empty_usage()
    for r in (news_result, technical_result, risk_result, fundamental_result):
        if r.token_usage:
            combined_usage = combined_usage.merge(r.token_usage)

    analysis_warnings = [
        f"{result.agent_name}: {result.status}"
        for result in (news_result, technical_result, risk_result, fundamental_result)
        if result.status != "ok"
    ]

    return AgentPipelineResult(
        news_result=news_result,
        technical_result=technical_result,
        risk_result=risk_result,
        fundamental_result=fundamental_result,
        score=score,
        action=action,
        reason=reason,
        agent_weights=weights,
        combined_usage=combined_usage,
        analysis_warnings=analysis_warnings,
    )
