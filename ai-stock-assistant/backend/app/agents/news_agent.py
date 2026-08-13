"""NewsAgent — 分析个股新闻舆情"""
from __future__ import annotations

from app.agents.base import AgentResult
from app.agents.llm import call_llm

SYSTEM_PROMPT = """你是一名 A 股新闻分析师。根据提供的新闻摘要，判断该股票的舆情倾向。
只返回 JSON：
{
  "stars": 1~5,
  "signal": "利好/偏利好/中性/偏利空/利空",
  "summary": "一句话概括新闻倾向",
  "details": "列举关键新闻及影响（2~3 条）"
}"""


def run_news_agent(code: str, name: str, news_summary: str) -> AgentResult:
    if not news_summary:
        return AgentResult(
            agent_name="NewsAgent",
            stars=3,
            signal="中性",
            summary="无相关新闻",
            details="今日未抓取到该股票的相关新闻。",
            status="unavailable",
        )
    user_prompt = f"""股票：{name}（{code}）

新闻摘要：
{news_summary}"""
    try:
        data, usage = call_llm(SYSTEM_PROMPT, user_prompt)
        return AgentResult(
            agent_name="NewsAgent",
            stars=max(1, min(5, int(data.get("stars", 3)))),
            signal=str(data.get("signal", "中性")),
            summary=str(data.get("summary", "")),
            details=str(data.get("details", "")),
            token_usage=usage,
        )
    except Exception:
        return AgentResult(
            agent_name="NewsAgent",
            stars=3,
            signal="中性",
            summary="新闻分析失败",
            details="LLM 调用异常，跳过新闻分析。",
            status="failed",
            error="LLM call failed",
        )
