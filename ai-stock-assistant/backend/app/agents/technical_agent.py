"""TechnicalAgent — 分析技术指标"""
from __future__ import annotations

from app.agents.base import AgentResult
from app.agents.llm import call_llm

SYSTEM_PROMPT = """你是一名 A 股技术分析师。根据股票的技术指标，判断走势倾向。
只返回 JSON：
{
  "stars": 1~5,
  "signal": "看涨/偏看涨/震荡/偏看跌/看跌",
  "summary": "一句话概括技术面结论",
  "details": "逐一说明 MACD/RSI/MA/BOLL 状态及观点"
}"""


def run_technical_agent(code: str, name: str, kline_summary: str, indicator_text: str) -> AgentResult:
    user_prompt = f"""股票：{name}（{code}）

K 线概要：
{kline_summary}

技术指标：
{indicator_text}"""
    try:
        data, usage = call_llm(SYSTEM_PROMPT, user_prompt)
        return AgentResult(
            agent_name="TechnicalAgent",
            stars=max(1, min(5, int(data.get("stars", 3)))),
            signal=str(data.get("signal", "震荡")),
            summary=str(data.get("summary", "")),
            details=str(data.get("details", "")),
            token_usage=usage,
        )
    except Exception:
        return AgentResult(
            agent_name="TechnicalAgent",
            stars=3,
            signal="震荡",
            summary="技术分析失败",
            details="LLM 调用异常，跳过技术分析。",
            status="failed",
            error="LLM call failed",
        )
