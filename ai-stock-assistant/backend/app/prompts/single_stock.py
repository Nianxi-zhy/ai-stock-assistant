from __future__ import annotations

from typing import Optional

BLOCK_LABELS_ZH = {
    "stock_info": "股票信息",
    "technical": "技术指标",
    "kline": "K 线摘要",
    "rules": "规则初筛",
    "news": "新闻舆情",
}

STATUS_LABELS_ZH = {
    "available": "可用",
    "missing": "缺失",
    "stale": "过期",
    "fetch_failed": "抓取失败",
}

SINGLE_STOCK_PROMPT = """你是一位专业的 A 股分析师。请根据以下数据进行分析。

## {stock_label}
- 代码：{code}
- 名称：{name}
- 日期：{trade_date}
- 最新收盘价：{close_price} 元
{price_filter_hint}

## {technical_label}
- MACD：DIF={macd_dif}, DEA={macd_dea}, 柱状图={macd_hist}（{macd_signal}）
- RSI(14)：{rsi}（{rsi_signal}）
- MA：MA5={ma5}, MA20={ma20}, MA60={ma60}
- BOLL：上轨={boll_upper}, 中轨={boll_mid}, 下轨={boll_lower}
- 成交量：今日={volume}

### 指标解读
{indicator_explanation}

## {kline_label}
{kline_summary}
{rules_block}
{news_block}

## 要求
1. 给出 1~5 星评级
2. 给出 0~100 的综合评分
3. 给出操作建议（买入/观望/卖出）
4. 用 3~5 句话说明理由，需结合新闻/公告/舆情与技术指标
5. 严格以 JSON 格式返回，不要输出其它内容

JSON 格式：
{{
  "score": 85,
  "stars": 4,
  "action": "买入",
  "reason": "..."
}}
"""


def _build_rules_block(
    rule_score: Optional[int] = None,
    passed_rules: Optional[list[str]] = None,
    failed_rules: Optional[list[str]] = None,
) -> str:
    if rule_score is None:
        return ""
    passed = "、".join(passed_rules) if passed_rules else "无"
    failed = "、".join(failed_rules) if failed_rules else "无"
    return f"""

## 规则初筛
- 规则评分：{rule_score}/100
- 已通过规则：{passed}
- 未通过规则：{failed}

请结合规则初筛与技术指标，给出最终评分与操作建议。"""


def _build_news_block(news_summary: Optional[str] = None) -> str:
    if not news_summary:
        return ""
    return f"""

## 新闻舆情
{news_summary}"""


def build_single_stock_prompt(
    *,
    rule_score: Optional[int] = None,
    passed_rules: Optional[list[str]] = None,
    failed_rules: Optional[list[str]] = None,
    news_summary: Optional[str] = None,
    **kwargs,
) -> str:
    rules_block = _build_rules_block(rule_score, passed_rules, failed_rules)
    news_block = _build_news_block(news_summary)

    payload = dict(kwargs)
    close_price = payload.pop("close_price", "N/A")

    price_filter_hint = payload.pop("price_filter_hint", "")
    if price_filter_hint:
        price_filter_hint = f"\n- {price_filter_hint}"

    return SINGLE_STOCK_PROMPT.format(
        stock_label=BLOCK_LABELS_ZH["stock_info"],
        technical_label=BLOCK_LABELS_ZH["technical"],
        kline_label=BLOCK_LABELS_ZH["kline"],
        rules_block=rules_block,
        news_block=news_block,
        close_price=close_price,
        price_filter_hint=price_filter_hint,
        **payload,
    )
