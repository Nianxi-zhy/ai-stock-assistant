from __future__ import annotations

from datetime import datetime

import pandas as pd

import app.config as cfg
from app.services.cache import TTLCache
from app.services.indicator_service import calculate_indicators
from app.services.stock_service import get_kline, get_realtime_price

_market_cache = TTLCache(default_ttl=3600)


def _index_score(kline) -> dict:
    enriched = calculate_indicators(kline)
    latest = enriched.iloc[-1]
    prev = enriched.iloc[-2] if len(enriched) >= 2 else latest

    close = float(latest["close"])
    ma20 = float(latest["ma20"]) if not pd.isna(latest.get("ma20")) else close
    ma60 = float(latest["ma60"]) if not pd.isna(latest.get("ma60")) else close
    rsi = float(latest["rsi"]) if not pd.isna(latest.get("rsi")) else 50
    volume = float(latest["volume"])
    macd_hist = float(latest["macd_hist"]) if not pd.isna(latest.get("macd_hist")) else 0
    macd_dif = float(latest["macd_dif"]) if not pd.isna(latest.get("macd_dif")) else 0
    macd_dea = float(latest["macd_dea"]) if not pd.isna(latest.get("macd_dea")) else 0

    vol_ma20 = enriched["volume"].tail(20).mean()
    vol_ma20_val = float(vol_ma20) if not pd.isna(vol_ma20) else volume
    vol_ratio = volume / vol_ma20_val if vol_ma20_val > 0 else 1.0

    if len(enriched) >= 6:
        close_5d = float(enriched.iloc[-6]["close"])
        chg_5d = (close - close_5d) / close_5d * 100
    else:
        chg_5d = 0.0

    ma20_pct = (close - ma20) / ma20 * 100

    # 1. 趋势位置 (25分): 当前价相对MA20的位置
    if ma20_pct > 3:
        trend = 25
    elif ma20_pct > 1:
        trend = 20
    elif ma20_pct > 0:
        trend = 14
    elif ma20_pct > -2:
        trend = 8
    elif ma20_pct > -5:
        trend = 3
    else:
        trend = 0

    # 2. 均线排列 (15分): MA20 vs MA60
    if ma20 > ma60:
        ma_score = 15 if ma20_pct > 0 else 10
    else:
        ma_score = 5 if ma20_pct > 0 else 0

    # 3. 短期动量 (20分): 5日涨跌幅
    if chg_5d > 5:
        momentum = 20
    elif chg_5d > 3:
        momentum = 16
    elif chg_5d > 1:
        momentum = 12
    elif chg_5d > 0:
        momentum = 8
    elif chg_5d > -3:
        momentum = 4
    else:
        momentum = 0

    # 4. 成交量能 (15分): 当日量 / 20日均量
    if vol_ratio > 1.5:
        vol_score = 15
    elif vol_ratio > 1.2:
        vol_score = 12
    elif vol_ratio > 0.8:
        vol_score = 9
    elif vol_ratio > 0.5:
        vol_score = 5
    else:
        vol_score = 0

    # 5. RSI情绪 (10分)
    if 40 <= rsi <= 60:
        rsi_score = 10
    elif 35 <= rsi <= 65:
        rsi_score = 8
    elif 30 <= rsi <= 70:
        rsi_score = 5
    elif 25 <= rsi <= 75:
        rsi_score = 2
    else:
        rsi_score = 0

    prev_macd_hist_val = prev.get("macd_hist")
    prev_macd_hist = float(prev_macd_hist_val) if prev_macd_hist_val is not None and not pd.isna(prev_macd_hist_val) else 0
    if macd_dif > macd_dea and macd_hist > 0:
        macd_score = 10
    elif macd_dif > macd_dea and macd_hist > prev_macd_hist:
        macd_score = 7
    elif macd_dif > macd_dea:
        macd_score = 4
    elif macd_dif < macd_dea and macd_hist < 0 and macd_hist < prev_macd_hist:
        macd_score = 1
    else:
        macd_score = 3

    return {
        "trend": trend,
        "ma_alignment": ma_score,
        "momentum": momentum,
        "volume": vol_score,
        "rsi": rsi_score,
        "macd": macd_score,
        "total": trend + ma_score + momentum + vol_score + rsi_score + macd_score,
        "ma20_pct": round(ma20_pct, 2),
        "chg_5d": round(chg_5d, 2),
        "vol_ratio": round(vol_ratio, 2),
        "rsi": round(rsi, 1),
    }


def assess_market_environment():
    cached = _market_cache.get("market_env")
    if cached is not None:
        return cached

    scores = []
    details = {}
    indices_data = []
    alignment_sign = 0

    for code, info in cfg.MARKET_INDICES.items():
        try:
            kline = get_kline(code, days=90, as_index=True)
            if kline is None or kline.empty:
                continue

            realtime_price = get_realtime_price(code, as_index=True)
            if realtime_price and realtime_price > 0:
                kline.iloc[-1, kline.columns.get_loc("close")] = realtime_price

            result = _index_score(kline)
            weighted = result["total"] * info["weight"]
            scores.append(weighted)
            details[f"{code}_score"] = result["total"]
            details[f"{code}_ma20_pct"] = result["ma20_pct"]
            details[f"{code}_chg_5d"] = result["chg_5d"]
            details[f"{code}_vol_ratio"] = result["vol_ratio"]
            details[f"{code}_rsi"] = result["rsi"]

            indices_data.append({
                "code": code,
                "name": info["name"],
                "price": round(float(kline.iloc[-1]["close"]), 2),
                "change_pct": round(result["ma20_pct"], 2),
                "score": result["total"],
            })

            if result["ma20_pct"] > 0:
                alignment_sign += 1
            elif result["ma20_pct"] < 0:
                alignment_sign -= 1
        except Exception:
            continue

    if not scores:
        return {
            "status": "cautious",
            "score": 50,
            "summary": "无法获取完整的市场数据，默认谨慎参与",
            "details": {},
            "indices": [],
            "timestamp": datetime.now().isoformat(),
        }

    raw_score = sum(scores)

    # 指数共振加分 (满分5分)
    alignment_score = 0
    total_indices = len(indices_data)
    if total_indices > 0:
        if alignment_sign == total_indices:
            alignment_score = 5
        elif alignment_sign > 0:
            alignment_score = 3
        elif alignment_sign == -total_indices:
            alignment_score = 0
        else:
            alignment_score = 1

    final_score = min(100, round(raw_score + alignment_score))

    if final_score >= cfg.MARKET_SUITABLE_THRESHOLD:
        status = "suitable"
        summary = _build_summary_suitable(indices_data)
    elif final_score >= cfg.MARKET_CAUTIOUS_THRESHOLD:
        status = "cautious"
        summary = _build_summary_cautious(indices_data)
    else:
        status = "unsuitable"
        summary = _build_summary_unsuitable(indices_data)

    result = {
        "status": status,
        "score": final_score,
        "summary": summary,
        "details": {
            "trend": details.get("000001_score", 0),
            "alignment": alignment_score,
        },
        "indices": indices_data,
        "timestamp": datetime.now().isoformat(),
    }

    _market_cache.set("market_env", result)
    return result


def _build_summary_suitable(indices) -> str:
    parts = []
    for i in indices:
        parts.append(f"{i['name']}{i['price']}点（{i['score']}分）")
    return "市场整体环境良好。" + "、".join(parts) + "，三大指数趋势向上，量能配合，适合积极参与。"


def _build_summary_cautious(indices) -> str:
    parts = []
    for i in indices:
        parts.append(f"{i['name']}{i['price']}点（{i['score']}分）")
    return "市场环境一般。" + "、".join(parts) + "，指数走势分化，量能不足，建议控制仓位谨慎参与。"


def _build_summary_unsuitable(indices) -> str:
    parts = []
    for i in indices:
        parts.append(f"{i['name']}{i['price']}点（{i['score']}分）")
    return "当前市场环境较差。" + "、".join(parts) + "，指数处于MA20下方，市场情绪偏弱，建议观望为主不宜开新仓。"
