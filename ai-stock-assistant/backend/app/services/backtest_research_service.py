import itertools
import json
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from app.db import get_connection
from app.services.backtest_service import (
    STRATEGY_FUNCTIONS,
    STRATEGY_NAMES,
    scan_strategy,
)
from app.services.indicator_service import calculate_indicators, detect_market_phase
from app.services.stock_service import get_kline, get_stock_name

_PHASE_SCORE: Dict[str, int] = {
    "bullish": 100,
    "neutral": 60,
    "bearish": 30,
    "unknown": 0,
}


def _lookup_stock_name(code: str) -> str:
    try:
        conn = get_connection()
        try:
            row = conn.execute("SELECT name FROM stock WHERE code = ?", (code,)).fetchone()
            if row and row["name"]:
                return row["name"]
        finally:
            conn.close()
    except Exception:
        pass
    try:
        return get_stock_name(code)
    except Exception:
        return ""


def _expand_param_grid(
    param_grid: Dict[str, List[Any]], max_combos: int
) -> Tuple[List[Dict[str, Any]], bool]:
    keys = list(param_grid.keys())
    if not keys:
        return [], False
    all_combos = list(itertools.product(*[param_grid[k] for k in keys]))
    truncated = len(all_combos) > max_combos
    combos = all_combos[:max_combos] if truncated else all_combos
    return [dict(zip(keys, values)) for values in combos], truncated


def _simulate(
    df: pd.DataFrame,
    buy_mask: pd.Series,
    sell_mask: pd.Series,
    initial_cash: float,
) -> Dict[str, Any]:
    cash = initial_cash
    holding = 0.0
    buy_price = 0.0
    peak_value = initial_cash
    max_drawdown = 0.0
    trades: List[Dict[str, Any]] = []

    for idx in range(len(df)):
        price = float(df.iloc[idx]["close"])
        if buy_mask.iloc[idx] and holding == 0 and cash > 0:
            shares = int((cash * 0.95) / price / 100) * 100
            if shares >= 100:
                cash -= shares * price
                holding = shares
                buy_price = price
        elif sell_mask.iloc[idx] and holding > 0:
            cash += holding * price
            trades.append({
                "pnl": holding * (price - buy_price),
                "pnl_pct": (price - buy_price) / buy_price * 100,
            })
            holding = 0
            buy_price = 0.0
        total_value = cash + holding * price
        if total_value > peak_value:
            peak_value = total_value
        drawdown = (peak_value - total_value) / peak_value * 100
        if drawdown > max_drawdown:
            max_drawdown = drawdown

    if holding > 0:
        final_price = float(df.iloc[-1]["close"])
        cash += holding * final_price
        trades.append({
            "pnl": holding * (final_price - buy_price),
            "pnl_pct": (final_price - buy_price) / buy_price * 100,
        })

    win_trades = [t for t in trades if t.get("pnl", 0) > 0]
    loss_trades = [t for t in trades if t.get("pnl", 0) < 0]
    total_pnl = cash - initial_cash
    return {
        "final_cash": round(cash, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl / initial_cash * 100, 2),
        "total_trades": len(trades),
        "win_trades": len(win_trades),
        "loss_trades": len(loss_trades),
        "win_rate": round(len(win_trades) / max(len(trades), 1) * 100, 1),
        "max_drawdown_pct": round(max_drawdown, 2),
    }


def _segment_benchmark_pct(seg_df: pd.DataFrame) -> float:
    if seg_df.empty:
        return 0.0
    first_close = float(seg_df.iloc[0]["close"])
    last_close = float(seg_df.iloc[-1]["close"])
    if first_close <= 0:
        return 0.0
    return round((last_close - first_close) / first_close * 100, 2)


def _persist_wf_run(
    code: str,
    strategy: str,
    strategy_name: str,
    days: int,
    initial_cash: float,
    stats: Dict[str, Any],
    combo: Dict[str, Any],
    mode: str,
    window_idx: int,
    env_status: str,
    env_score: int,
    benchmark_pct: float,
) -> None:
    try:
        conn = get_connection()
        try:
            row = conn.execute("SELECT name FROM stock WHERE code = ?", (code,)).fetchone()
            name = row["name"] if row else ""
            conn.execute(
                """INSERT INTO backtest_runs
                   (code, name, strategy_key, strategy_name, days, initial_cash, final_cash,
                    total_pnl, total_pnl_pct, total_trades, win_trades, loss_trades,
                    win_rate, max_drawdown_pct, benchmark_return_pct, params_json,
                    env_status, env_score)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    code, name, strategy, strategy_name, days, initial_cash, stats["final_cash"],
                    stats["total_pnl"], stats["total_pnl_pct"], stats["total_trades"],
                    stats["win_trades"], stats["loss_trades"], stats["win_rate"],
                    stats["max_drawdown_pct"], benchmark_pct,
                    json.dumps({"params": combo, "mode": mode, "window": window_idx}, ensure_ascii=False),
                    env_status, env_score,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


def batch_scan(
    codes: List[str],
    strategy: str = "macd_cross",
    param_grid: Optional[Dict[str, List[Any]]] = None,
    days: int = 365,
    initial_cash: float = 100000.0,
    max_combos: int = 64,
) -> Dict[str, Any]:
    if strategy not in STRATEGY_FUNCTIONS:
        return {"error": f"未知策略: {strategy}，可选: {', '.join(STRATEGY_FUNCTIONS.keys())}"}
    if not codes:
        return {"error": "codes 不能为空"}
    if not param_grid:
        return {"error": "param_grid 必须包含至少一个候选参数"}

    warnings: List[str] = []
    code_results: List[Dict[str, Any]] = []
    per_param: Dict[str, Dict[str, Any]] = {}
    total_runs = 0

    for code in codes:
        r = scan_strategy(
            code,
            strategy=strategy,
            param_grid=param_grid,
            days=days,
            initial_cash=initial_cash,
            max_combos=max_combos,
        )
        if "error" in r:
            warnings.append(f"{code}: {r['error']}")
            continue
        if r.get("warning"):
            warnings.append(f"{code}: {r['warning']}")
        total_runs += r["combos_evaluated"]
        results = r["results"]
        best = max(results, key=lambda x: x["total_pnl_pct"], default=None)
        code_results.append({
            "code": code,
            "name": _lookup_stock_name(code),
            "combos_evaluated": r["combos_evaluated"],
            "best_params": best["params"] if best else {},
            "best_pnl_pct": best["total_pnl_pct"] if best else 0.0,
            "best_win_rate": best["win_rate"] if best else 0.0,
        })
        for item in results:
            key = str(item["params"])
            agg = per_param.setdefault(key, {"positive_stocks": 0, "pnl_sum": 0.0, "stocks_covered": 0})
            agg["stocks_covered"] += 1
            agg["pnl_sum"] += item["total_pnl_pct"]
            if item["total_pnl_pct"] > 0:
                agg["positive_stocks"] += 1

    top_param_sets = [
        {
            "param_key": key,
            "positive_stocks": agg["positive_stocks"],
            "avg_pnl_pct": round(agg["pnl_sum"] / agg["stocks_covered"], 2),
            "stocks_covered": agg["stocks_covered"],
        }
        for key, agg in per_param.items()
    ]
    top_param_sets.sort(key=lambda x: (x["positive_stocks"], x["avg_pnl_pct"]), reverse=True)

    return {
        "strategy": strategy,
        "strategy_name": STRATEGY_NAMES[strategy],
        "codes": code_results,
        "top_param_sets": top_param_sets,
        "warning": "；".join(warnings),
        "total_runs": total_runs,
    }


def walk_forward(
    code: str,
    strategy: str = "macd_cross",
    param_grid: Optional[Dict[str, List[Any]]] = None,
    days: int = 730,
    initial_cash: float = 100000.0,
    window: int = 120,
    step: int = 20,
    max_combos: int = 150,
    top_n: int = 5,
) -> Dict[str, Any]:
    if strategy not in STRATEGY_FUNCTIONS:
        return {"error": f"未知策略: {strategy}，可选: {', '.join(STRATEGY_FUNCTIONS.keys())}"}
    if window < 8:
        return {"error": f"window 至少需要 8 个交易日（训练 75% 后需保证验证段 ≥ 2 条）"}
    if step < 1:
        return {"error": "step 必须大于等于 1"}
    if top_n < 1:
        return {"error": "top_n 必须大于等于 1"}

    combos, truncated = _expand_param_grid(param_grid or {}, max_combos)
    if not combos:
        return {"error": "param_grid 必须包含至少一个候选参数"}

    df = get_kline(code, days=days)
    if df.empty:
        return {"error": f"股票 {code} 无数据"}
    df = calculate_indicators(df)
    total = len(df)
    if total < window:
        return {"error": f"K 线数据不足：共 {total} 条，window={window} 无法形成完整窗口"}

    env_status = detect_market_phase()
    env_score = _PHASE_SCORE.get(env_status, 0)
    strategy_name = STRATEGY_NAMES[strategy]
    signal_func = STRATEGY_FUNCTIONS[strategy]
    mask_cache: List[Tuple[pd.Series, pd.Series]] = [signal_func(df, combo) for combo in combos]

    windows: List[Dict[str, Any]] = []
    window_idx = 0
    while window_idx * step + window <= total:
        start = window_idx * step
        end = start + window
        train_end = start + int(window * 0.75)
        if train_end <= start or train_end >= end:
            window_idx += 1
            continue

        train_records: List[Dict[str, Any]] = []
        for ci, combo in enumerate(combos):
            buy_mask, sell_mask = mask_cache[ci]
            train_df = df.iloc[start:train_end].reset_index(drop=True)
            train_stats = _simulate(
                train_df,
                buy_mask.iloc[start:train_end].reset_index(drop=True),
                sell_mask.iloc[start:train_end].reset_index(drop=True),
                initial_cash,
            )
            _persist_wf_run(
                code, strategy, strategy_name, days, initial_cash,
                train_stats, combo, "wf-train", window_idx,
                env_status, env_score,
                _segment_benchmark_pct(train_df),
            )
            train_records.append({"params": combo, "stats": train_stats})

        train_records.sort(key=lambda x: x["stats"]["total_pnl_pct"], reverse=True)
        candidates = train_records[: max(1, min(top_n, len(train_records)))]
        best = candidates[0]

        best_val_stats: Optional[Dict[str, Any]] = None
        for rec in candidates:
            combo = rec["params"]
            ci = combos.index(combo)
            buy_mask, sell_mask = mask_cache[ci]
            val_df = df.iloc[train_end:end].reset_index(drop=True)
            val_stats = _simulate(
                val_df,
                buy_mask.iloc[train_end:end].reset_index(drop=True),
                sell_mask.iloc[train_end:end].reset_index(drop=True),
                initial_cash,
            )
            _persist_wf_run(
                code, strategy, strategy_name, days, initial_cash,
                val_stats, combo, "wf-val", window_idx,
                env_status, env_score,
                _segment_benchmark_pct(val_df),
            )
            if rec is best:
                best_val_stats = val_stats

        windows.append({
            "window_idx": window_idx,
            "train_start": str(df.iloc[start]["date"]),
            "train_end": str(df.iloc[train_end - 1]["date"]),
            "val_start": str(df.iloc[train_end]["date"]),
            "val_end": str(df.iloc[end - 1]["date"]),
            "best_params": best["params"],
            "train_pnl_pct": best["stats"]["total_pnl_pct"],
            "val_pnl_pct": best_val_stats["total_pnl_pct"] if best_val_stats else 0.0,
            "train_win_rate": best["stats"]["win_rate"],
            "val_win_rate": best_val_stats["win_rate"] if best_val_stats else 0.0,
        })
        window_idx += 1

    if not windows:
        return {"error": f"K 线数据不足：共 {total} 条，window={window}、step={step} 无法形成任何完整窗口"}

    profitable = sum(1 for w in windows if w["val_pnl_pct"] > 0)
    summary = {
        "windows_total": len(windows),
        "windows_profitable": profitable,
        "consistency_pct": round(profitable / len(windows) * 100, 1),
        "avg_val_pnl_pct": round(sum(w["val_pnl_pct"] for w in windows) / len(windows), 2),
    }

    # 闭环 2：一致性足够且验证收益为正 → 该参数标 active，供每日自动回测使用
    active = int(
        summary["consistency_pct"] >= 50.0 and summary["avg_val_pnl_pct"] > 0.0
    )
    _persist_strategy_params(strategy, best_params=windows[-1]["best_params"], summary=summary, active=active)

    return {
        "code": code,
        "strategy": strategy,
        "strategy_name": strategy_name,
        "window_days": window,
        "step_days": step,
        "windows": windows,
        "summary": summary,
        "truncated": truncated,
        "active": active,
        "warning": f"参数组合数超过上限 {max_combos}，仅评估前 {max_combos} 个组合" if truncated else "",
    }


def _persist_strategy_params(strategy: str, best_params: Dict[str, Any], summary: Dict[str, Any], active: int) -> None:
    """把 walk-forward 的最终参数写入 strategy_params；active=1 时退休同策略旧 active 记录。"""
    conn = get_connection()
    try:
        if active:
            conn.execute(
                "UPDATE strategy_params SET active = 0 WHERE strategy_key = ? AND active = 1",
                (strategy,),
            )
        conn.execute(
            """INSERT INTO strategy_params
               (strategy_key, params_json, source, consistency_pct, avg_val_pnl_pct,
                windows_total, active)
               VALUES (?, ?, 'walkforward', ?, ?, ?, ?)""",
            (
                strategy,
                json.dumps(best_params, ensure_ascii=False),
                summary["consistency_pct"],
                summary["avg_val_pnl_pct"],
                summary["windows_total"],
                active,
            ),
        )
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()


def get_active_strategy_params(strategy: str) -> Optional[Dict[str, Any]]:
    """读取该策略当前 active 的 walk-forward 参数（无则 None），供每日自动回测使用。"""
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT params_json, consistency_pct, avg_val_pnl_pct, created_at
               FROM strategy_params
               WHERE strategy_key = ? AND active = 1
               ORDER BY created_at DESC LIMIT 1""",
            (strategy,),
        ).fetchone()
        if not row:
            return None
        return {
            "params": json.loads(row["params_json"]),
            "consistency_pct": row["consistency_pct"],
            "avg_val_pnl_pct": row["avg_val_pnl_pct"],
            "created_at": row["created_at"],
        }
    except Exception:
        return None
    finally:
        conn.close()
