"""FundamentalAgent - 基本面分析"""
from __future__ import annotations

import logging

from app.agents.base import AgentResult
from app.agents.llm import call_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一名A股基本面分析师。根据提供的基本面数据，判断该股票的基本面质量。

评分标准：
- 5星：基本面优秀，盈利能力强，成长性好，估值合理
- 4星：基本面良好，大部分指标健康
- 3星：基本面一般，无明显亮点但无明显风险
- 2星：基本面偏弱，存在一些隐忧
- 1星：基本面差，存在明显风险

只返回JSON：
{
  "stars": 1~5,
  "signal": "优质/良好/一般/偏弱/差",
  "summary": "一句话概括基本面结论",
  "details": "列举关键基本面指标及观点（2~3条）"
}"""


def run_fundamental_agent(code: str, name: str, fund_summary: str, fund_score: int = 0) -> AgentResult:
    if not fund_summary or fund_score == 0:
        return AgentResult(
            agent_name="FundamentalAgent",
            stars=3, signal="暂无数据",
            summary="基本面数据不可用",
            details="未能获取到该股票的财务数据。",
            status="unavailable",
        )

    user_prompt = f"股票：{name}（{code}）\n基本面数据：{fund_summary}\n预评分：{fund_score}/100"
    try:
        data, usage = call_llm(SYSTEM_PROMPT, user_prompt)
        return AgentResult(
            agent_name="FundamentalAgent",
            stars=max(1, min(5, int(data.get("stars", 3)))),
            signal=str(data.get("signal", "一般")),
            summary=str(data.get("summary", "")),
            details=str(data.get("details", "")),
            token_usage=usage,
        )
    except Exception as e:
        logger.warning("Agent %s failed: %s", "FundamentalAgent", e)
        return AgentResult(
            agent_name="FundamentalAgent",
            stars=3, signal="一般",
            summary="基本面分析失败",
            details="LLM调用异常，跳过基本面分析。",
            status="failed",
            error="LLM call failed",
        )
