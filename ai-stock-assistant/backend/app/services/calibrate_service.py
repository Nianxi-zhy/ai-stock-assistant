"""规则引擎参数校准（阶段 5 · 闭环 1）

用历史数据衡量每条规则对未来收益的预测力（IC 风格的分层差），
自动生成规则权重并写入 rule_params 表；推荐管线随后从表读取生效。

设计要点（避免数据泄漏）：
- 对每只样本股，决策日取"倒数第 lookback 根 K 线"（比如 20 天前），
  用决策日的指标判断规则通过与否，用决策日到今天的 10 日收益作为结果。
- 这样所有样本都是"过去某天做决策、到今天看结果"，参数只依据历史，无未来数据。
"""
from __future__ import annotations

import logging
import math
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from time import monotonic
from typing import Any, Dict, List, Optional

import app.config as cfg
from app.db import get_connection
from app.services.filter_service import prescreen_by_spot, get_a_share_spot
from app.services.indicator_service import calculate_indicators
from app.services.stock_service import get_kline

logger = logging.getLogger(__name__)

RULE_NAMES = [
    "close above MA20",
    "MA20 above or near MA60",
    "RSI in healthy range",
    "MACD improving",
    "volume above 20-day average",
]
DEFAULT_WEIGHTS = {
    "close above MA20": 20,
    "MA20 above or near MA60": 10,
    "RSI in healthy range": 15,
    "MACD improving": 15,
    "volume above 20-day average": 5,
}


# rule_params 全表缓存：一次加载，多处复用，写后显式失效。
# 热路径（每股 5 次查询）经缓存后每次扫描仅 1 次全表查询。
_params_lock = threading.Lock()
_params_cache: Optional[Dict[str, tuple]] = None


def _load_all_params() -> Dict[str, tuple]:
    """一次查询把 rule_params 全表读成 {key: (value, value_str)}。"""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT key, value, value_str FROM rule_params").fetchall()
        return {r["key"]: (r["value"], r["value_str"]) for r in rows}
    finally:
        conn.close()


def _get_params() -> Dict[str, tuple]:
    """读缓存；未命中时加载并填充（双检锁，加载失败不缓存以便下次重试）。"""
    global _params_cache
    if _params_cache is not None:
        return _params_cache
    with _params_lock:
        if _params_cache is None:
            try:
                _params_cache = _load_all_params()
            except Exception:
                return {}
        return _params_cache


def invalidate_params_cache() -> None:
    """写 rule_params 后调用，显式失效缓存。"""
    global _params_cache
    with _params_lock:
        _params_cache = None


def _param(key: str, default: Any) -> Any:
    try:
        row = _get_params().get(key)
        if row is None:
            return default
        value, value_str = row
        if isinstance(default, bool):
            return value_str or value
        if isinstance(default, int):
            return int(value or 0)
        return float(value or 0.0)
    except Exception:
        return default


def _latest(row, field: str) -> Optional[float]:
    v = row.get(field)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def _rule_hits(df, idx: int) -> Dict[str, bool]:
    """在 df 的第 idx 根 K 线上评估 5 条规则（与 rule_engine 一致）。"""
    latest = df.iloc[idx]
    previous = df.iloc[idx - 1] if idx >= 1 else latest
    close = _latest(latest, "close")
    ma20 = _latest(latest, "ma20")
    ma60 = _latest(latest, "ma60")
    rsi = _latest(latest, "rsi")
    macd_hist = _latest(latest, "macd_hist")
    prev_macd_hist = _latest(previous, "macd_hist")
    volume = _latest(latest, "volume")
    ma20_tol = _param("thr.ma20_ma60_tol", 0.98)
    rsi_min = _param("thr.rsi_min", 30)
    rsi_max = _param("thr.rsi_max", 70)
    vol_ratio = _param("thr.volume_ratio", 1.05)
    volume_ma20 = float(df["volume"].iloc[max(0, idx - 19): idx + 1].mean())

    return {
        "close above MA20": close is not None and ma20 is not None and close > ma20,
        "MA20 above or near MA60": ma20 is not None and ma60 is not None and ma20 >= ma60 * ma20_tol,
        "RSI in healthy range": rsi is not None and rsi_min < rsi < rsi_max,
        "MACD improving": (
            macd_hist is not None
            and prev_macd_hist is not None
            and (macd_hist > 0 or macd_hist > prev_macd_hist)
        ),
        "volume above 20-day average": (
            volume is not None and volume_ma20 > 0 and volume >= volume_ma20 * vol_ratio
        ),
    }


def _stock_sample(code: str, name: str, lookback: int = 20, horizon: int = 10, days: int = 120):
    """返回 (hits, fwd_ret)：决策日 = 倒数第 lookback 根，结果 = 未来 horizon 日收益。"""
    try:
        kline = get_kline(code, days=days)
        if kline is None or kline.empty:
            return None
        enriched = calculate_indicators(kline)
        if len(enriched) <= lookback + horizon + 1:
            return None
        idx = len(enriched) - 1 - lookback
        hits = _rule_hits(enriched, idx)
        entry = _latest(enriched.iloc[idx], "close")
        exit_ = _latest(enriched.iloc[idx + horizon], "close")
        if not entry or not exit_ or entry <= 0:
            return None
        return hits, (exit_ / entry - 1) * 100.0
    except Exception:
        return None


def calibrate_rule_weights(
    sample_limit: int = 300,
    lookback: int = 20,
    horizon: int = 10,
    workers: int = 12,
) -> Dict[str, Any]:
    """IC 校准：对样本股票，统计每条规则 通过组 vs 失败组 的平均未来收益差 → 归一化权重。"""
    started = monotonic()
    spot = get_a_share_spot()
    spot = prescreen_by_spot(spot, max_prescreen=sample_limit)
    rows = [(str(r.code).zfill(6), str(r.name)) for r in spot.itertuples(index=False)][:sample_limit]

    samples: List[tuple] = []
    pool = ThreadPoolExecutor(max_workers=workers)
    try:
        futures = [pool.submit(_stock_sample, code, name, lookback, horizon) for code, name in rows]
        for f in as_completed(futures):
            res = f.result()
            if res is not None:
                samples.append(res)
    finally:
        pool.shutdown(wait=True)

    if len(samples) < 30:
        return {
            "error": f"有效样本不足 ({len(samples)}/{sample_limit})，跳过校准",
            "samples": len(samples),
        }

    stats: Dict[str, Dict[str, float]] = {}
    for rule in RULE_NAMES:
        passed = [ret for hits, ret in samples if hits.get(rule)]
        failed = [ret for hits, ret in samples if not hits.get(rule)]
        stats[rule] = {
            "pass_n": len(passed),
            "fail_n": len(failed),
            "pass_avg": sum(passed) / len(passed) if passed else 0.0,
            "fail_avg": sum(failed) / len(failed) if failed else 0.0,
            "spread": (sum(passed) / len(passed) if passed else 0.0)
            - (sum(failed) / len(failed) if failed else 0.0),
        }

    spreads = {rule: max(0.0, s["spread"]) for rule, s in stats.items()}
    total = sum(spreads.values()) or 1.0
    weights = {rule: round(spreads[rule] / total * 100) for rule in RULE_NAMES}
    for rule, w in weights.items():
        if w == 0:
            weights[rule] = 1  # 权重为 0 意味着规则完全不起作用，保留最小权重

    return {
        "calibrated_on": date.today().isoformat(),
        "samples": len(samples),
        "lookback": lookback,
        "horizon": horizon,
        "elapsed_seconds": round(monotonic() - started, 1),
        "weights": weights,
        "rule_stats": stats,
    }


def apply_rule_params(result: Dict[str, Any]) -> int:
    """把校准结果写入 rule_params 表（source='calibrated'），返回写入条数。"""
    if "error" in result:
        return 0
    conn = get_connection()
    n = 0
    try:
        for rule, weight in result["weights"].items():
            conn.execute(
                """INSERT OR REPLACE INTO rule_params (key, value, value_str, source, calibrated_on, detail)
                   VALUES (?, ?, '', 'calibrated', ?, ?)""",
                (f"weight.{rule}", float(weight), result["calibrated_on"],
                 f"samples={result['samples']}, spread={result['rule_stats'][rule]['spread']:.2f}pp"),
            )
            n += 1
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    invalidate_params_cache()
    return n


def load_rule_weights() -> Dict[str, int]:
    """读取当前生效的规则权重（校准优先，否则默认），供 rule_engine 使用。走全表缓存。"""
    try:
        weights = {}
        for key, (value, _value_str) in _get_params().items():
            if key.startswith("weight."):
                weights[key.replace("weight.", "", 1)] = int(value or 0)
        for rule in RULE_NAMES:
            weights.setdefault(rule, cfg.RULE_WEIGHTS.get(rule, DEFAULT_WEIGHTS[rule]))
        return weights
    except Exception:
        return dict(cfg.RULE_WEIGHTS)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    result = calibrate_rule_weights()
    import json

    logger.info(json.dumps(result, ensure_ascii=False, indent=2, default=str))
