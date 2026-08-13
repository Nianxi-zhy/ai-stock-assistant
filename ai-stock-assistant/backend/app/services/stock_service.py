from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import requests

import app.config  # noqa: F401
from app.config import TENCENT_KLINE_URL, TENCENT_QUOTE_URL
from app.schemas.stock import KlineBar, StockSnapshot
from app.services.cache import TTLCache

try:
    import akshare as ak
except ImportError:
    ak = None

logger = logging.getLogger(__name__)

STOCK_NAMES = {
    "600519": "贵州茅台",
}

_kline_cache = TTLCache(default_ttl=300)
_realtime_cache = TTLCache(default_ttl=10)

_TENCENT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}


_INDEX_MARKET_MAP = {
    "000001": "sh",  # 上证指数
    "000688": "sh",  # 科创50
    "399001": "sz",  # 深证成指
    "399006": "sz",  # 创业板指
    "399005": "sz",  # 中小板指
    "000300": "sh",  # 沪深300
    "000016": "sh",  # 上证50
    "399905": "sz",  # 中证500
}


def _tencent_market(code: str, as_index: bool = False) -> str:
    """市场前缀。as_index=True 时按指数映射（000001=上证指数 sh）；
    否则按股票规则（6 开头=sh，其余=sz，000001=平安银行）。"""
    if as_index and code in _INDEX_MARKET_MAP:
        return _INDEX_MARKET_MAP[code]
    return "sh" if code.startswith("6") else "sz"


def _fetch_kline_from_tencent(code: str, days: int, as_index: bool = False) -> Optional[pd.DataFrame]:
    """使用腾讯证券 API 获取日 K 线。失败返回 None 而不是抛异常。"""
    market = _tencent_market(code, as_index)
    params = {"param": f"{market}{code},day,,,{days},qfq"}
    try:
        resp = requests.get(TENCENT_KLINE_URL, params=params, timeout=10, headers=_TENCENT_HEADERS)
        if resp.status_code != 200:
            return None
        payload = resp.json()
        if payload.get("code") != 0:
            return None
        symbol_key = f"{market}{code}"
        stock_data = payload.get("data", {}).get(symbol_key, {})
        klines = stock_data.get("qfqday") or stock_data.get("day")
        if not klines:
            return None
        rows = []
        for parts in klines:
            if len(parts) < 6:
                continue
            rows.append({
                "date": parts[0],
                "open": float(parts[1]),
                "close": float(parts[2]),
                "high": float(parts[3]),
                "low": float(parts[4]),
                "volume": float(parts[5]),
            })
        if not rows:
            return None
        return pd.DataFrame(rows)
    except Exception:
        return None


def _fetch_kline_from_akshare(code: str, days: int, as_index: bool = False) -> Optional[pd.DataFrame]:
    """当腾讯 API 失败时，用 akshare 获取日 K 线。"""
    if ak is None:
        return None
    try:
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=int(days * 1.6) + 30)).strftime("%Y%m%d")
        if as_index:
            symbol = f"{_tencent_market(code, as_index=True)}{code}"
            raw = ak.stock_zh_index_daily(symbol=symbol)
            if raw is None or raw.empty:
                return None
            df = pd.DataFrame({
                "date": raw["date"].astype(str),
                "open": raw["open"].astype(float),
                "close": raw["close"].astype(float),
                "high": raw["high"].astype(float),
                "low": raw["low"].astype(float),
                "volume": raw["volume"].astype(float),
            })
            return df[df["date"] >= start]
        symbol = code.zfill(6)
        raw = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start, end_date=end, adjust="qfq")
        if raw is None or raw.empty:
            return None
        df = pd.DataFrame({
            "date": raw["日期"].astype(str),
            "open": raw["开盘"].astype(float),
            "close": raw["收盘"].astype(float),
            "high": raw["最高"].astype(float),
            "low": raw["最低"].astype(float),
            "volume": raw["成交量"].astype(float),
        })
        return df
    except Exception:
        return None


def get_kline(code: str, days: int = 60, end_date: Optional[datetime] = None, as_index: bool = False) -> pd.DataFrame:
    cache_key = f"kline:{code}:{days}:{int(as_index)}"
    cached = _kline_cache.get(cache_key)
    if cached is not None:
        return cached
    if days <= 0:
        raise ValueError("days 必须大于 0")

    df = _fetch_kline_from_tencent(code, days, as_index)
    if df is None or df.empty:
        df = _fetch_kline_from_akshare(code, days, as_index)
    if df is None or df.empty:
        raise ValueError(f"无法获取股票 {code} 的 K 线数据")
    df = df.tail(days).reset_index(drop=True)
    _kline_cache.set(cache_key, df)
    return df


def get_realtime_price(code: str, as_index: bool = False) -> float:
    cache_key = f"realtime:{code}:{int(as_index)}"
    cached = _realtime_cache.get(cache_key)
    if cached is not None:
        return cached
    market = _tencent_market(code, as_index)
    url = f"{TENCENT_QUOTE_URL}{market}{code}"
    try:
        resp = requests.get(url, timeout=10, headers=_TENCENT_HEADERS)
        resp.raise_for_status()
        text = resp.text.strip()
        if not text or "=" not in text:
            raise ValueError
        parts = text.split('"')[1].split("~")
        if len(parts) < 4:
            raise ValueError
        price = float(parts[3])
        _realtime_cache.set(cache_key, price)
        return price
    except Exception:
        raise ValueError(f"无法获取股票 {code} 实时价格")


_name_cache = TTLCache(default_ttl=86400)


def get_stock_name(code: str) -> str:
    """通过腾讯实时行情接口获取股票名称。失败返回空串。"""
    cache_key = f"name:{code}"
    cached = _name_cache.get(cache_key)
    if cached is not None:
        return cached
    market = _tencent_market(code, as_index=False)
    url = f"{TENCENT_QUOTE_URL}{market}{code}"
    try:
        resp = requests.get(url, timeout=10, headers=_TENCENT_HEADERS)
        resp.raise_for_status()
        text = resp.text.strip()
        if not text or "=" not in text:
            raise ValueError
        parts = text.split('"')[1].split("~")
        if len(parts) < 2 or not parts[1]:
            raise ValueError
        name = parts[1].strip()
        _name_cache.set(cache_key, name)
        return name
    except Exception:
        return ""


def get_stock_snapshot(code: str, days: int = 60) -> StockSnapshot:
    kline = get_kline(code, days=days)
    bars = [KlineBar(**row) for row in kline.to_dict(orient="records")]
    return StockSnapshot(
        code=code,
        name=STOCK_NAMES.get(code, code),
        days=len(bars),
        klines=bars,
    )


if __name__ == "__main__":
    snapshot = get_stock_snapshot("600519", days=60)
    logger.info(f"{snapshot.name}({snapshot.code}) 最近 {snapshot.days} 个交易日 K 线")
    logger.info("最新 5 条:")
    for bar in snapshot.klines[-5:]:
        logger.info(
            f"{bar.date} 开={bar.open:.2f} 高={bar.high:.2f} "
            f"低={bar.low:.2f} 收={bar.close:.2f} 量={bar.volume:.0f}"
        )
