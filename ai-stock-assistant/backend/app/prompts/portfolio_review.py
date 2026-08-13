"""持仓回顾 Prompt"""
from __future__ import annotations

from typing import Optional

PORTFOLIO_REVIEW_PROMPT = """你是一名专业的 A 股分析师。用户已经持有以下股票，请用普通人能看懂的大白话给出建议。

## 持仓信息
- 股票：{name}（{code}）
- 买入价：{buy_price}
- 当前价：{current_price}
- 盈亏：{pnl_pct}%
- 持有天数：{holding_days}
- 止损价：{stop_loss}
- 止盈价：{take_profit}

## 技术指标
- MACD：DIF={dif}, DEA={dea}, 柱状图={hist}（{macd_signal}）
- RSI(14)：{rsi}（{rsi_signal}）
- MA：MA5={ma5}, MA20={ma20}, MA60={ma60}
- 股价与 MA20 关系：{close_vs_ma20}
- 成交量：今日={volume}, 20 日均量={volume_ma20}

## 近期新闻
{news_summary}

## 决策要求
用户是短线快进快出的风格，持仓周期短，请按这个风格给建议。
请综合以上信息，选择以下操作之一：
1. **持有** — 趋势正常，继续持有
2. **加仓** — 趋势向好，可在回调时加仓
3. **减仓** — 风险上升或达到部分止盈
4. **卖出** — 趋势反转、达到止盈/止损或风险过高

## 额外建议
除了操作建议，请同时给出：
- **建议卖出价格**（suggested_sell_price）：根据技术面和当前走势，给出一个建议的卖出目标价（单位：元）。如果建议立即卖出，可以给当前价附近；如果建议继续持有，可以给一个短线目标止盈价

## 关键要求
reason 字段必须用**大白话**写，让没有金融知识的普通股民也能看懂。请遵守：
- 用生活化的语言解释为什么这么建议
- 严禁出现任何技术指标名称（如 MACD、RSI、KDJ、MA、均线、金叉、死叉、布林带、零轴等）
- 不要罗列数据，直接说结论

✅ 好的例子：
  - "股价走势偏强，建议继续持有"
  - "最近跌得比较凶，已经到止损线了，建议卖出"
  - "股价一直在成本价附近来回震荡，暂时没有明确方向，建议继续观察"
  - "这只股票最近涨了不少，可以考虑先卖一部分锁定利润"
  - "整体趋势还可以，但短期波动有点大，建议继续持有看看"

❌ 不好的例子（因为出现了术语）：
  - "MACD 零轴上方金叉，RSI 55 中性偏强，均线多头排列"
  - "KDJ 处于超买区域，注意回调风险"
  - "布林带上轨附近压力较大"

以 JSON 格式返回：
{{
  "action": "持有/加仓/减仓/卖出",
  "score": 0~100,
  "stars": 1~5,
  "reason": "用大白话写 1~2 句结论性建议",
  "suggested_sell_price": 15.80
}}
"""


def build_portfolio_review_prompt(
    code: str,
    name: str,
    buy_price: float,
    current_price: float,
    pnl_pct: float,
    holding_days: int,
    stop_loss: float,
    take_profit: float,
    dif: str,
    dea: str,
    hist: str,
    macd_signal: str,
    rsi: str,
    rsi_signal: str,
    ma5: str,
    ma20: str,
    ma60: str,
    close_vs_ma20: str,
    volume: str,
    volume_ma20: str = "N/A",
    news_summary: Optional[str] = None,
) -> str:
    news = news_summary or "暂无近期新闻"
    return PORTFOLIO_REVIEW_PROMPT.format(
        code=code,
        name=name,
        buy_price=f"{buy_price:.2f}",
        current_price=f"{current_price:.2f}",
        pnl_pct=f"{pnl_pct:.2f}",
        holding_days=holding_days,
        stop_loss=f"{stop_loss:.2f}" if stop_loss else "未设置",
        take_profit=f"{take_profit:.2f}" if take_profit else "未设置",
        dif=dif,
        dea=dea,
        hist=hist,
        macd_signal=macd_signal,
        rsi=rsi,
        rsi_signal=rsi_signal,
        ma5=ma5,
        ma20=ma20,
        ma60=ma60,
        close_vs_ma20=close_vs_ma20,
        volume=volume,
        volume_ma20=volume_ma20,
        news_summary=news,
    )
