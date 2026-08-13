from __future__ import annotations

import json
import time
from typing import Optional

import pandas as pd
import requests

import app.config  # noqa: F401
import app.config as cfg
from app.config import SINA_QUOTE_URL

_SINA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://finance.sina.com.cn/",
}

_spot_cache: Optional[pd.DataFrame] = None
_spot_cache_time: float = 0
_SPOT_CACHE_TTL = 120


def _fetch_spot_from_sina() -> pd.DataFrame:
    rows = []
    page = 1
    page_size = 100
    while True:
        params = {
            "page": page,
            "num": page_size,
            "sort": "symbol",
            "asc": 1,
            "node": "hs_a",
            "symbol": "",
            "_s_r_a": "init",
        }
        try:
            resp = requests.get(SINA_QUOTE_URL, params=params, timeout=15, headers=_SINA_HEADERS)
            resp.raise_for_status()
            text = resp.text.strip()
            if not text or text == "null":
                break
            items = json.loads(text)
            if not items:
                break
        except Exception:
            break
        for item in items:
            code = str(item.get("code", "")).zfill(6)
            name = str(item.get("name", ""))
            price = item.get("trade")
            if price is None:
                continue
            try:
                price = float(price)
            except (ValueError, TypeError):
                continue
            changepercent = _safe_float(item.get("changepercent"))
            volume = _safe_float(item.get("volume"))
            amount = _safe_float(item.get("amount"))
            settlement = _safe_float(item.get("settlement"))
            rows.append({
                "code": code, "name": name, "price": price,
                "changepercent": changepercent, "volume": volume,
                "amount": amount, "settlement": settlement,
            })
        if len(items) < page_size:
            break
        page += 1
        time.sleep(0.1)
    if not rows:
        raise ValueError("新浪财经 API 返回空数据")
    return pd.DataFrame(rows)


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        v = float(val)
        return v
    except (ValueError, TypeError):
        return None


def get_a_share_spot() -> pd.DataFrame:
    global _spot_cache, _spot_cache_time
    now = time.time()
    if _spot_cache is not None and now - _spot_cache_time < _SPOT_CACHE_TTL:
        return _spot_cache
    last_error: Optional[Exception] = None
    for attempt in range(2):
        try:
            df = _fetch_spot_from_sina()
            if df.empty:
                raise ValueError("未获取到 A 股实时行情")
            _spot_cache = df
            _spot_cache_time = now
            return df
        except Exception as exc:
            last_error = exc
            if attempt < 1:
                time.sleep(1)
    raise last_error or RuntimeError("获取 A 股实时行情失败")


def filter_by_max_price(spot_df: pd.DataFrame, max_price: float) -> pd.DataFrame:
    filtered = spot_df[
        (spot_df["price"] >= cfg.MIN_STOCK_PRICE) & (spot_df["price"] <= max_price)
    ].copy()
    return _exclude_risky_stocks(filtered).reset_index(drop=True)


def _exclude_risky_stocks(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    name_series = df["name"].astype(str).str.upper()
    risky_mask = (
        name_series.str.contains("ST", na=False)
        | name_series.str.contains("退", na=False)
        | name_series.str.contains("\\*", regex=True, na=False)
    )
    return df[~risky_mask].copy()


def passes_price_filter(price: float, max_price: Optional[float] = None) -> bool:
    if not cfg.LOW_PRICE_MODE:
        return True
    limit = max_price if max_price is not None else cfg.MAX_STOCK_PRICE
    return price <= limit


def get_price_mode_label() -> str:
    if cfg.LOW_PRICE_MODE:
        return f"低价股模式（{cfg.MIN_STOCK_PRICE:.2f} ~ {cfg.MAX_STOCK_PRICE:.2f} 元）"
    return "全价位模式（不限制单价）"


def pick_demo_stock_code(preferred_code: Optional[str] = None) -> tuple[str, str, float]:
    spot = get_a_share_spot()

    if preferred_code:
        matched = spot[spot["code"] == preferred_code.zfill(6)]
        if not matched.empty:
            row = matched.iloc[0]
            return str(row["code"]), str(row["name"]), float(row["price"])

    if cfg.LOW_PRICE_MODE:
        candidates = filter_by_max_price(spot, cfg.MAX_STOCK_PRICE)
        if candidates.empty:
            raise ValueError(f"未找到单价 ≤ {cfg.MAX_STOCK_PRICE} 元的股票")
        row = candidates.iloc[0]
        return str(row["code"]), str(row["name"]), float(row["price"])

    default_code = "600519"
    matched = spot[spot["code"] == default_code]
    if matched.empty:
        row = spot.iloc[0]
        return str(row["code"]), str(row["name"]), float(row["price"])
    row = matched.iloc[0]
    return str(row["code"]), str(row["name"]), float(row["price"])


def prescreen_by_spot(spot_df: pd.DataFrame, max_prescreen: int = 300) -> pd.DataFrame:
    """基于实时行情数据做轻量预筛选，快速缩小范围。

    规则（无需 K 线，纯实时数据）：
    1. 价格在配置范围内
    2. 排除 ST / 退市 / * 股
    3. 排除停牌（成交量为 0 或价格为 0）
    4. 排除涨停 / 跌停（涨跌幅 > 9.5% 或 < -9.5%）
    5. 成交额 > 500 万（排除冷门股）
    6. 按 成交额 降序排列，取前 max_prescreen 只
    """
    df = spot_df.copy()

    if cfg.LOW_PRICE_MODE:
        df = df[(df["price"] >= cfg.MIN_STOCK_PRICE) & (df["price"] <= cfg.MAX_STOCK_PRICE)]

    df = _exclude_risky_stocks(df)

    if "volume" in df.columns:
        df = df[df["volume"].fillna(0) > 0]

    if "changepercent" in df.columns:
        cp = df["changepercent"].fillna(0).abs()
        df = df[cp < 9.5]

    if "amount" in df.columns:
        df = df[df["amount"].fillna(0) > 5_000_000]

    if "amount" in df.columns:
        df = df.sort_values("amount", ascending=False)

    return df.head(max_prescreen).reset_index(drop=True)
