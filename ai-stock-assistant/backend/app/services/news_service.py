from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

import akshare as ak
import requests

import app.config  # noqa: F401
from app.config import (
    NEWS_EM_LIMIT,
    NEWS_FETCH_EM,
    NEWS_FETCH_SINA,
    NEWS_MAX_DAYS,
    NEWS_NOTICE_DAYS,
    NEWS_NOTICE_LIMIT,
    NEWS_SUMMARY_MAX_CHARS,
    SINA_NEWS_URL,
)
from app.schemas.news import NewsItem, StockNewsBundle

logger = logging.getLogger(__name__)


def _run_with_timeout(func, timeout=30):
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func)
        try:
            return future.result(timeout=timeout)
        except (FuturesTimeoutError, Exception) as e:
            logger.warning("_run_with_timeout 执行失败: %s", e)
            return None


def _truncate(text: str, max_len: int = 200) -> str:
    text = " ".join(str(text).split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _parse_date(date_str: str) -> Optional[datetime]:
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


def _filter_by_age(items: list[NewsItem], max_days: int = 7) -> list[NewsItem]:
    cutoff = datetime.now() - timedelta(days=max_days)
    filtered = []
    for item in items:
        if not item.publish_time or item.publish_time in ("", "未知"):
            filtered.append(item)
            continue
        dt = _parse_date(item.publish_time)
        if dt and dt < cutoff:
            continue
        filtered.append(item)
    return filtered


def _fetch_em_stock_news(code: str, limit: int) -> List[NewsItem]:
    def _fetch():
        return ak.stock_news_em(symbol=code.zfill(6))

    raw = _run_with_timeout(_fetch, timeout=30)
    if raw is None or raw.empty:
        return []

    items: List[NewsItem] = []
    for row in raw.head(limit).itertuples(index=False):
        items.append(
            NewsItem(
                source="东方财富-新闻",
                title=str(getattr(row, "新闻标题", "")),
                content=_truncate(getattr(row, "新闻内容", ""), 220),
                publish_time=str(getattr(row, "发布时间", "")),
                url=str(getattr(row, "新闻链接", "")),
            )
        )
    return items


def _fetch_em_notices(code: str, limit: int) -> List[NewsItem]:
    end = datetime.now().strftime("%Y-%m-%d")
    begin = (datetime.now() - timedelta(days=NEWS_NOTICE_DAYS)).strftime("%Y-%m-%d")

    def _fetch():
        return ak.stock_individual_notice_report(
            security=code.zfill(6),
            begin_date=begin,
            end_date=end,
        )

    raw = _run_with_timeout(_fetch, timeout=30)
    if raw is None or raw.empty:
        return []

    items: List[NewsItem] = []
    for row in raw.head(limit).itertuples(index=False):
        items.append(
            NewsItem(
                source="东方财富-公告",
                title=str(getattr(row, "公告标题", "")),
                content=str(getattr(row, "公告类型", "")),
                publish_time=str(getattr(row, "公告日期", "")),
                url=str(getattr(row, "网址", "")),
            )
        )
    return items


def _fetch_sina_market_news(limit: int = 3) -> List[NewsItem]:
    url = SINA_NEWS_URL
    params = {"pageid": "153", "lid": "2516", "k": "", "num": str(limit)}
    try:
        resp = requests.get(url, params=params, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        data = resp.json()
        items_data = data.get("result", {}).get("data", [])
    except Exception:
        return []

    items: List[NewsItem] = []
    for item in items_data:
        if len(items) >= limit:
            break
        title = item.get("title", "")
        if len(title) < 6:
            continue
        ts = item.get("ctime", 0)
        pub_time = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else ""
        items.append(NewsItem(
            source="新浪财经",
            title=title[:120],
            content="",
            publish_time=pub_time,
            url=item.get("url", ""),
        ))
    return items


def get_stock_news_bundle(code: str, name: str) -> StockNewsBundle:
    """聚合个股相关新闻，内存拼接，不落库。"""
    items: List[NewsItem] = []

    fetchers = []
    if NEWS_FETCH_EM:
        fetchers.append(("em_news", lambda: _fetch_em_stock_news(code, NEWS_EM_LIMIT)))
        fetchers.append(("em_notice", lambda: _fetch_em_notices(code, NEWS_NOTICE_LIMIT)))
    if NEWS_FETCH_SINA:
        fetchers.append(("sina", lambda: _fetch_sina_market_news(3)))

    for _, fetcher in fetchers:
        try:
            items.extend(fetcher())
        except Exception:
            continue
        time.sleep(0.2)

    if NEWS_MAX_DAYS > 0:
        items = _filter_by_age(items, NEWS_MAX_DAYS)

    return StockNewsBundle(code=code.zfill(6), name=name, items=items)


def build_news_summary(bundle: StockNewsBundle, max_chars: Optional[int] = None) -> str:
    limit = max_chars or NEWS_SUMMARY_MAX_CHARS
    if not bundle.items:
        return "暂无近期相关新闻、公告或舆情。"

    lines: List[str] = []
    for index, item in enumerate(bundle.items, start=1):
        line = (
            f"{index}. [{item.source}] {item.title} "
            f"({item.publish_time}) {item.content}"
        )
        lines.append(line.strip())

    summary = "\n".join(lines)
    if len(summary) <= limit:
        return summary
    return summary[: limit - 3] + "..."


def clear_news_cache() -> None:
    pass


if __name__ == "__main__":
    bundle = get_stock_news_bundle("600519", "贵州茅台")
    logger.info(f"{bundle.name}({bundle.code}) 共 {bundle.count} 条")
    logger.info(build_news_summary(bundle))
