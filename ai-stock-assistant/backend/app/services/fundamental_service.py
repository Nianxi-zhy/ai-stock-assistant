"""基本面数据服务：PE、PB 等估值指标（使用腾讯接口）"""
from __future__ import annotations

from typing import Optional

import requests

from app.services.cache import TTLCache

_fund_cache = TTLCache(default_ttl=86400)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

# 腾讯 API 字段索引:
# parts[39] = PE(TTM)
# parts[46] = PB
# parts[45] = 总市值(亿)


def _code_to_tencent_symbol(code: str) -> str:
    code = code.zfill(6)
    if code.startswith("6"):
        return f"sh{code}"
    return f"sz{code}"


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        v = str(val).strip()
        if not v or v == "" or v == "–" or v == "-":
            return None
        return float(v)
    except (ValueError, TypeError):
        return None


def get_fundamental_snapshot(code: str, name: str) -> dict:
    cache_key = f"fund:{code}"
    cached = _fund_cache.get(cache_key)
    if cached is not None:
        return {**cached, "name": name}

    result = {
        "name": name, "pe_ratio": None, "pb_ratio": None,
        "roe": None, "revenue_growth": None, "profit_growth": None,
        "debt_ratio": None, "market_cap": None,
        "summary": "", "score": 0,
    }

    symbol = _code_to_tencent_symbol(code)
    try:
        resp = requests.get(
            f"https://web.sqt.gtimg.cn/q={symbol}",
            timeout=10,
            headers=_HEADERS,
        )
        parts = resp.text.split("~")
        if len(parts) > 46:
            result["pe_ratio"] = _safe_float(parts[39])
            result["pb_ratio"] = _safe_float(parts[46])
            result["market_cap"] = _safe_float(parts[45])
    except Exception:
        pass

    result["score"] = _calc_fundamental_score(result)
    result["summary"] = _build_fundamental_summary(result)
    _fund_cache.set(cache_key, result)
    return result


def _calc_fundamental_score(data: dict) -> int:
    points, max_pts = 0, 0
    if data.get("roe") is not None:
        roe = data["roe"]; max_pts += 25
        if roe >= 15: points += 25
        elif roe >= 10: points += 18
        elif roe >= 5: points += 10
        elif roe > 0: points += 5
    if data.get("revenue_growth") is not None:
        rg = data["revenue_growth"]; max_pts += 20
        if rg >= 20: points += 20
        elif rg >= 10: points += 15
        elif rg >= 0: points += 10
        elif rg >= -10: points += 3
    if data.get("profit_growth") is not None:
        pg = data["profit_growth"]; max_pts += 20
        if pg >= 20: points += 20
        elif pg >= 10: points += 15
        elif pg >= 0: points += 10
        elif pg >= -10: points += 3
    if data.get("pe_ratio") is not None:
        pe = data["pe_ratio"]; max_pts += 15
        if 10 <= pe <= 30: points += 12
        elif 0 < pe < 10: points += 8
        elif 30 < pe <= 60: points += 6
        elif pe > 60: points += 2
    if data.get("pb_ratio") is not None:
        pb = data["pb_ratio"]; max_pts += 10
        if 1 <= pb <= 4: points += 8
        elif 0 < pb < 1: points += 5
        elif pb > 4: points += 3
    if data.get("debt_ratio") is not None:
        dr = data["debt_ratio"]; max_pts += 10
        if dr <= 40: points += 10
        elif dr <= 60: points += 7
        elif dr <= 80: points += 3
    return round(points / max_pts * 100) if max_pts > 0 else 0


def _build_fundamental_summary(data: dict) -> str:
    parts = []
    if data.get("pe_ratio") is not None: parts.append(f"PE={data['pe_ratio']:.1f}")
    if data.get("pb_ratio") is not None: parts.append(f"PB={data['pb_ratio']:.1f}")
    if data.get("roe") is not None: parts.append(f"ROE={data['roe']:.1f}%")
    if data.get("revenue_growth") is not None: parts.append(f"营收增速={data['revenue_growth']:.1f}%")
    if data.get("profit_growth") is not None: parts.append(f"利润增速={data['profit_growth']:.1f}%")
    if data.get("debt_ratio") is not None: parts.append(f"负债率={data['debt_ratio']:.1f}%")
    return " | ".join(parts) if parts else "基本面数据待获取"
