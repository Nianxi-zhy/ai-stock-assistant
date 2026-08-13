from __future__ import annotations

from typing import Optional

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator
from ta.volatility import BollingerBands

from app.schemas.stock import IndicatorSnapshot
from app.services.stock_service import get_kline
import numpy as np


def _signal_macd(dif: float, dea: float, hist: float) -> str:
    if dif > dea and hist > 0:
        return "金叉，多头"
    if dif < dea and hist < 0:
        return "死叉，空头"
    return "震荡"


def _explain_macd(dif: float, dea: float, hist: float, signal: str) -> str:
    if "金叉" in signal:
        return f"MACD 金叉（DIF {dif:.2f} 上穿 DEA {dea:.2f}），柱状图 {hist:+.2f} 转正，短期趋势走强"
    if "死叉" in signal:
        return f"MACD 死叉（DIF {dif:.2f} 下穿 DEA {dea:.2f}），柱状图 {hist:+.2f} 为负，空头占优"
    return f"MACD 震荡（DIF {dif:.2f}，DEA {dea:.2f}），柱状图 {hist:+.2f}，方向不明确"


def _explain_rsi(rsi: float, signal: str) -> str:
    if signal == "超买":
        return f"RSI 为 {rsi:.1f}，进入超买区（≥70），短期可能存在回调风险"
    if signal == "超卖":
        return f"RSI 为 {rsi:.1f}，进入超卖区（≤30），可能迎来反弹机会"
    return f"RSI 为 {rsi:.1f}，处于健康区间（30~70），未出现极端信号"


def _explain_ma(close: float, ma5: float, ma20: float, ma60: float) -> str:
    parts = []
    if ma5 > ma20:
        parts.append(f"MA5（{ma5:.2f}）在 MA20（{ma20:.2f}）之上，短期均线多头排列")
    else:
        parts.append(f"MA5（{ma5:.2f}）在 MA20（{ma20:.2f}）之下，短期空头排列")
    if close > ma20:
        parts.append(f"股价 {close:.2f} 站上 MA20，中期趋势偏多")
    else:
        parts.append(f"股价 {close:.2f} 在 MA20 下方，中期承压")
    if ma60 and ma20 > ma60:
        parts.append(f"MA20 在 MA60（{ma60:.2f}）之上，中长期趋势向好")
    elif ma60:
        parts.append(f"MA20 在 MA60（{ma60:.2f}）之下，中长期趋势偏弱")
    return "；".join(parts)


def _explain_boll(close: float, upper: float, mid: float, lower: float) -> str:
    if close >= upper:
        return f"股价 {close:.2f} 触及布林上轨 {upper:.2f}，超买，注意回调"
    if close <= lower:
        return f"股价 {close:.2f} 触及布林下轨 {lower:.2f}，超卖，可能反弹"
    position = (close - lower) / (upper - lower) * 100
    return f"股价运行于布林带中轨 {mid:.2f} 附近（带内 {position:.0f}% 位置），波动正常"


def build_indicator_explanation(snapshot: "IndicatorSnapshot") -> str:
    """生成中文指标解读，供 AI Prompt 使用。"""
    lines = [
        _explain_macd(snapshot.macd_dif or 0, snapshot.macd_dea or 0, snapshot.macd_hist or 0, snapshot.macd_signal),
        _explain_rsi(snapshot.rsi or 50, snapshot.rsi_signal),
        _explain_ma(snapshot.close, snapshot.ma5 or 0, snapshot.ma20 or 0, snapshot.ma60 or 0),
    ]
    if snapshot.boll_upper and snapshot.boll_mid and snapshot.boll_lower:
        lines.append(_explain_boll(snapshot.close, snapshot.boll_upper, snapshot.boll_mid, snapshot.boll_lower))
    return "\n".join(lines)


def _signal_rsi(rsi: float) -> str:
    if rsi >= 70:
        return "超买"
    if rsi <= 30:
        return "超卖"
    return "健康区间"


def _build_kline_summary(kline: pd.DataFrame, n: int = 5) -> str:
    tail = kline.tail(n)
    lines = []
    for row in tail.itertuples(index=False):
        lines.append(
            f"{row.date} 收={row.close:.2f} 量={row.volume:.0f}"
        )
    return "\n".join(lines)


def calculate_indicators(kline: pd.DataFrame) -> pd.DataFrame:
    """基于 K 线计算常用技术指标。"""
    result = kline.copy()

    result["ma5"] = SMAIndicator(close=result["close"], window=5).sma_indicator()
    result["ma20"] = SMAIndicator(close=result["close"], window=20).sma_indicator()
    result["ma60"] = SMAIndicator(close=result["close"], window=60).sma_indicator()

    macd = MACD(close=result["close"])
    result["macd_dif"] = macd.macd()
    result["macd_dea"] = macd.macd_signal()
    result["macd_hist"] = macd.macd_diff()

    result["rsi"] = RSIIndicator(close=result["close"], window=14).rsi()

    boll = BollingerBands(close=result["close"], window=20, window_dev=2)
    result["boll_upper"] = boll.bollinger_hband()
    result["boll_mid"] = boll.bollinger_mavg()
    result["boll_lower"] = boll.bollinger_lband()


    # ATR (14)
    high_low = result["high"] - result["low"]
    high_close = abs(result["high"] - result["close"].shift(1))
    low_close = abs(result["low"] - result["close"].shift(1))
    tr = np.maximum(high_low, np.maximum(high_close, low_close))
    result["atr"] = tr.rolling(14).mean()
    result["atr_pct"] = result["atr"] / result["close"] * 100

    return result


def build_indicator_snapshot(
    kline: pd.DataFrame,
    code: str,
    name: Optional[str] = None,
) -> IndicatorSnapshot:
    enriched = calculate_indicators(kline)
    latest = enriched.iloc[-1]

    dif = float(latest["macd_dif"])
    dea = float(latest["macd_dea"])
    hist = float(latest["macd_hist"])
    rsi = float(latest["rsi"])

    snap = IndicatorSnapshot(
        code=code,
        name=name or code,
        trade_date=str(latest["date"]),
        close=float(latest["close"]),
        volume=float(latest["volume"]),
        atr=float(latest["atr"]) if pd.notna(latest["atr"]) else None,
        atr_pct=float(latest["atr_pct"]) if pd.notna(latest["atr_pct"]) else None,
        market_phase=detect_market_phase(),

        ma5=float(latest["ma5"]) if pd.notna(latest["ma5"]) else None,
        ma20=float(latest["ma20"]) if pd.notna(latest["ma20"]) else None,
        ma60=float(latest["ma60"]) if pd.notna(latest["ma60"]) else None,
        macd_dif=dif,
        macd_dea=dea,
        macd_hist=hist,
        macd_signal=_signal_macd(dif, dea, hist),
        rsi=rsi,
        rsi_signal=_signal_rsi(rsi),
        boll_upper=float(latest["boll_upper"]) if pd.notna(latest["boll_upper"]) else None,
        boll_mid=float(latest["boll_mid"]) if pd.notna(latest["boll_mid"]) else None,
        boll_lower=float(latest["boll_lower"]) if pd.notna(latest["boll_lower"]) else None,
        kline_summary=_build_kline_summary(kline),
    )
    snap.indicator_explanation = build_indicator_explanation(snap)
    return snap


def get_indicator_snapshot(code: str, days: int = 60, name: Optional[str] = None) -> IndicatorSnapshot:
    kline = get_kline(code, days=days)
    return build_indicator_snapshot(kline, code=code, name=name)


if __name__ == "__main__":
    snapshot = get_indicator_snapshot("600519", days=60, name="贵州茅台")
    print(f"{snapshot.name}({snapshot.code}) 指标快照 @ {snapshot.trade_date}")
    print(f"收盘: {snapshot.close:.2f}")
    print(
        f"MACD: DIF={snapshot.macd_dif:.4f}, DEA={snapshot.macd_dea:.4f}, "
        f"HIST={snapshot.macd_hist:.4f} ({snapshot.macd_signal})"
    )
    print(f"RSI: {snapshot.rsi:.2f} ({snapshot.rsi_signal})")
    print(
        f"MA: MA5={snapshot.ma5:.2f}, MA20={snapshot.ma20:.2f}, MA60={snapshot.ma60:.2f}"
    )
    print(
        f"BOLL: 上={snapshot.boll_upper:.2f}, 中={snapshot.boll_mid:.2f}, "
        f"下={snapshot.boll_lower:.2f}"
    )


def detect_market_phase() -> str:
    try:
        import app.config as cfg
        kline = get_kline(cfg.MARKET_INDEX_CODE, days=cfg.MARKET_MA_DAYS + 30, as_index=True)
        enriched = calculate_indicators(kline)
        latest = enriched.iloc[-1]
        close = float(latest["close"])
        ma_val = float(latest[f"ma{cfg.MARKET_MA_DAYS}"])
        ma_pct = (close - ma_val) / ma_val * 100
        if ma_pct > 3:
            return "bullish"
        elif ma_pct < cfg.MARKET_BEARISH_THRESHOLD:
            return "bearish"
        return "neutral"
    except Exception:
        return "unknown"
