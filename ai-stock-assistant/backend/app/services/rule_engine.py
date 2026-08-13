from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from dataclasses import dataclass
from time import monotonic
from typing import Iterable, Optional

import pandas as pd

import app.config as cfg
from app.schemas.stock import RuleCandidate
from app.services.calibrate_service import _param, load_rule_weights
from app.services.filter_service import get_a_share_spot, passes_price_filter, prescreen_by_spot
from app.services.indicator_service import build_indicator_snapshot, calculate_indicators
from app.services.stock_service import get_kline


@dataclass(frozen=True)
class RuleCheck:
    name: str
    passed: bool
    weight: int


def _latest_number(row: pd.Series, field: str) -> Optional[float]:
    value = row.get(field)
    if pd.isna(value):
        return None
    return float(value)


def _is_risky_name(name: str) -> bool:
    upper = name.upper()
    return "ST" in upper or "退" in name or "*" in name


def _evaluate_rules(enriched: pd.DataFrame, name: str) -> list[RuleCheck]:
    latest = enriched.iloc[-1]
    previous = enriched.iloc[-2] if len(enriched) >= 2 else latest

    close = _latest_number(latest, "close")
    ma20 = _latest_number(latest, "ma20")
    ma60 = _latest_number(latest, "ma60")
    rsi = _latest_number(latest, "rsi")
    macd_hist = _latest_number(latest, "macd_hist")
    prev_macd_hist = _latest_number(previous, "macd_hist")
    volume = _latest_number(latest, "volume")
    volume_ma20 = float(enriched["volume"].tail(20).mean()) if len(enriched) >= 20 else None

    macd_turning_positive = (
        macd_hist is not None
        and prev_macd_hist is not None
        and (macd_hist > 0 or macd_hist > prev_macd_hist)
    )

    # 阈值优先读 rule_params（校准可调），无记录时用 config 默认值
    ma20_ma60_tol = float(_param("thr.ma20_ma60_tol", 0.98))
    rsi_min = float(_param("thr.rsi_min", 30))
    rsi_max = float(_param("thr.rsi_max", 70))
    volume_ratio = float(_param("thr.volume_ratio", 1.05))

    # 权重优先读 rule_params（校准结果），无记录时用 config 默认值
    weights = load_rule_weights()

    checks = [
        RuleCheck("close above MA20", close is not None and ma20 is not None and close > ma20, weights.get("close above MA20", 20)),
        RuleCheck("MA20 above or near MA60", ma20 is not None and ma60 is not None and ma20 >= ma60 * ma20_ma60_tol, weights.get("MA20 above or near MA60", 10)),
        RuleCheck("RSI in healthy range", rsi is not None and rsi_min < rsi < rsi_max, weights.get("RSI in healthy range", 15)),
        RuleCheck("MACD improving", macd_turning_positive, weights.get("MACD improving", 15)),
        RuleCheck(
            "volume above 20-day average",
            volume is not None and volume_ma20 is not None and volume >= volume_ma20 * volume_ratio,
            weights.get("volume above 20-day average", 5),
        ),
    ]
    return checks


def _rule_score(checks: Iterable[RuleCheck]) -> int:
    check_list = list(checks)
    possible = sum(check.weight for check in check_list)
    gained = sum(check.weight for check in check_list if check.passed)
    if possible <= 0:
        return 0
    return round(gained / possible * 100)


def evaluate_stock(code: str, name: str, days: int = 80) -> RuleCandidate | None:
    try:
        kline = get_kline(code, days=days)
        enriched = calculate_indicators(kline)
        latest_close = _latest_number(enriched.iloc[-1], "close")
        if latest_close is None or _is_risky_name(name) or not passes_price_filter(latest_close):
            return None
        checks = _evaluate_rules(enriched, name)
        indicators = build_indicator_snapshot(kline, code=code, name=name)
        passed = [check.name for check in checks if check.passed]
        failed = [check.name for check in checks if not check.passed]
        return RuleCandidate(
            code=code,
            name=name,
            trade_date=indicators.trade_date,
            close_price=indicators.close,
            rule_score=_rule_score(checks),
            passed_rules=passed,
            failed_rules=failed,
            indicators=indicators,
        )
    except Exception:
        return None


def screen_candidates(
    max_candidates: int = 30,
    min_rule_score: int = 60,
    days: int = 80,
    prescreen_limit: int = 300,
    deadline: Optional[float] = None,
) -> list[RuleCandidate]:
    if max_candidates <= 0:
        raise ValueError("max_candidates must be greater than 0")

    spot = get_a_share_spot()
    spot = prescreen_by_spot(
        spot,
        max_prescreen=min(prescreen_limit, cfg.RECOMMENDATION_MAX_PRESCREEN),
    )

    rows = [(str(r.code).zfill(6), str(r.name)) for r in spot.itertuples(index=False)]
    if not rows:
        return []

    candidates: list[RuleCandidate] = []
    pool_size = min(cfg.FULL_SCAN_MAX_WORKERS, len(rows))

    pool = ThreadPoolExecutor(max_workers=pool_size)
    timed_out = False
    try:
        futures = {
            pool.submit(evaluate_stock, code, name, days): i
            for i, (code, name) in enumerate(rows)
        }
        timeout = None if deadline is None else max(0, deadline - monotonic())
        for future in as_completed(futures, timeout=timeout):
            candidate = future.result()
            if candidate is not None and candidate.rule_score >= min_rule_score:
                candidates.append(candidate)
    except FuturesTimeoutError:
        timed_out = True
    finally:
        if timed_out:
            for future in futures:
                future.cancel()
            pool.shutdown(wait=False, cancel_futures=True)
        else:
            pool.shutdown(wait=True)

    candidates.sort(key=lambda item: item.rule_score, reverse=True)
    return candidates[:max_candidates]


if __name__ == "__main__":
    import json

    result = screen_candidates(max_candidates=10)
    print(json.dumps([item.model_dump(exclude={"indicators"}) for item in result], ensure_ascii=False, indent=2))
