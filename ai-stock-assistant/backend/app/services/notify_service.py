"""Server酱通知服务"""
from __future__ import annotations

from typing import Optional

import requests

from app.config import SERVER_CHAN_KEY

_SERVER_CHAN_URL = "https://sctapi.ftqq.com"


def send_server_chan(
    title: str,
    content: str,
    key: Optional[str] = None,
) -> bool:
    """通过 Server酱 SendKey 推送消息到微信。

    返回 True 表示发送成功，False 表示失败。
    """
    send_key = key or SERVER_CHAN_KEY
    if not send_key:
        return False

    try:
        resp = requests.post(
            f"{_SERVER_CHAN_URL}/{send_key}.send",
            data={"title": title, "desp": content},
            timeout=15,
        )
        result = resp.json()
        return result.get("code") == 0
    except Exception:
        return False


def send_daily_report_message(
    date_str: str,
    holdings_count: int,
    recommendations_count: int,
    candidate_count: int,
    total_cost: float,
    recommendations: Optional[list[dict]] = None,
    key: Optional[str] = None,
) -> bool:
    """发送每日 AI 投研报告到微信。"""
    title = f"AI 投研报告 — {date_str}"

    lines = [f"## 今日持仓回顾\n\n> 已分析持仓：{holdings_count} 只\n"]

    if recommendations:
        lines.append("## 今日推荐\n")
        for r in recommendations:
            action_emoji = {"买入": "🟢", "观望": "🟡", "卖出": "🔴", "持有": "🔵"}
            emoji = ""
            for k, v in action_emoji.items():
                if k in r["action"]:
                    emoji = v
                    break
            lines.append(
                f"{emoji} **{r['name']}（{r['code']}）** "
                f"现价 {r['price']:.2f} 元 | "
                f"{r['action']} | 评分 {r['score']}"
            )
            lines.append(f"> {r['reason'][:80]}\n")

    lines.append(f"## 费用统计\n\n> 本次分析消耗：¥{total_cost:.4f}")
    lines.append("\n---\n*数据仅供参考，不构成投资建议*")

    return send_server_chan(title=title, content="\n".join(lines), key=key)


def send_text_message(
    title: str,
    body: str,
    key: Optional[str] = None,
) -> bool:
    """发送纯文本消息到微信。"""
    return send_server_chan(title=title, content=body, key=key)
