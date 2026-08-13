"""DecisionAgent — 综合决策"""
from __future__ import annotations

import logging

from app.agents.base import AgentResult
from app.agents.llm import call_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一名 A 股投资决策分析师。你将收到多个子 Agent 的分析结果，
需要综合判断并给出最终的评分和操作建议。

评分标准（总分 1~10）：
- 9-10：强烈推荐买入，多重信号共振
- 7-8：推荐买入，总体向好
- 5-6：中性观望，无明确方向
- 3-4：不建议买入，存在风险
- 1-2：强烈回避

只返回 JSON：
{
  "total_score": 1~10,
  "action": "买入/观望/回避",
  "reason": "综合各 Agent 意见后的决策理由（2~3 句）",
  "agent_weights": {
    "NewsAgent": "权重理由",
    "TechnicalAgent": "权重理由",
    "RiskAgent": "权重理由",
    "FundamentalAgent": "权重理由"
  }
}"""


def run_decision_agent(
    code: str, name: str,
    news_result: AgentResult,
    technical_result: AgentResult,
    risk_result: AgentResult,
    fundamental_result: AgentResult | None = None,
) -> tuple[int, str, str, str]:
    star_filled = chr(9733)
    star_empty = chr(9734)

    fund_block = ""
    if fundamental_result is not None:
        fund_block = f"""
--- FundamentalAgent ---
星级：{star_filled * fundamental_result.stars}{star_empty * (5 - fundamental_result.stars)}
信号：{fundamental_result.signal}
结论：{fundamental_result.summary}
详情：{fundamental_result.details}"""

    agents_summary = f"""{name}{code}

--- NewsAgent ---
星级：{star_filled * news_result.stars}{star_empty * (5 - news_result.stars)}
信号：{news_result.signal}
结论：{news_result.summary}
详情：{news_result.details}

--- TechnicalAgent ---
星级：{star_filled * technical_result.stars}{star_empty * (5 - technical_result.stars)}
信号：{technical_result.signal}
结论：{technical_result.summary}
详情：{technical_result.details}

--- RiskAgent ---
星级：{star_filled * risk_result.stars}{star_empty * (5 - risk_result.stars)}
信号：{risk_result.signal}
结论：{risk_result.summary}
详情：{risk_result.details}{fund_block}"""

    try:
        data, usage = call_llm(SYSTEM_PROMPT, agents_summary)
        score = max(1, min(10, int(data.get("total_score", 5))))
        action = str(data.get("action", ""))
        reason = str(data.get("reason", ""))
        weights = str(data.get("agent_weights", {}))
        return score, action, reason, weights
    except Exception as e:
        logger.warning("Agent %s failed: %s", "DecisionAgent", e)
        fund_stars = fundamental_result.stars if fundamental_result else 3
        avg = (news_result.stars + technical_result.stars + risk_result.stars + fund_stars) / 4
        score = round(avg * 2)
        score = max(1, min(10, score))
        action = "买入" if score >= 7 else "观望"
        return score, action, "DecisionAgent fallback", "{}"
