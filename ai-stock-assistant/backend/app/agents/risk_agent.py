"""RiskAgent — 风险评估"""
from __future__ import annotations

from app.agents.base import AgentResult
from app.agents.llm import call_llm

SYSTEM_PROMPT = """你是一名 A 股风控分析师。根据以下信息评估该股票的交易风险。
风险维度包括：波动风险、流动性风险、追高风险、财报雷区。
只返回 JSON：
{
  "stars": 1~5（星级越高越安全，1=极高风险，5=极低风险）,
  "signal": "低风险/偏低风险/中等风险/偏高风险/高风险",
  "summary": "一句话概括风险等级",
  "details": "列出主要风险点（2~3 条）"
}"""


def run_risk_agent(
    code: str, name: str,
    kline_summary: str, indicator_text: str,
    price: float | None = None,
) -> AgentResult:
    lines = [f"股票：{name}（{code}）"]
    if price is not None:
        lines.append(f"当前价格：{price:.2f}")
    if kline_summary:
        lines.append(f"\nK 线概要：\n{kline_summary}")
    if indicator_text:
        lines.append(f"\n技术指标：\n{indicator_text}")
    user_prompt = "\n".join(lines)
    try:
        data, usage = call_llm(SYSTEM_PROMPT, user_prompt)
        return AgentResult(
            agent_name="RiskAgent",
            stars=max(1, min(5, int(data.get("stars", 3)))),
            signal=str(data.get("signal", "中等风险")),
            summary=str(data.get("summary", "")),
            details=str(data.get("details", "")),
            token_usage=usage,
        )
    except Exception:
        return AgentResult(
            agent_name="RiskAgent",
            stars=3,
            signal="中等风险",
            summary="风险评估失败",
            details="LLM 调用异常，跳过风险评估。",
            status="failed",
            error="LLM call failed",
        )
