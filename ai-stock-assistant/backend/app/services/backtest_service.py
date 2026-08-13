"""回测服务：策略回测 + 收益率计算 + K线标记 + 资金曲线"""
from __future__ import annotations

import itertools
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.services.indicator_service import calculate_indicators
from app.services.stock_service import get_kline

# ---------------------------------------------------------------------------
# 策略信号函数
# 每个函数返回 (buy: pd.Series[bool], sell: pd.Series[bool])
# 共用同一个经过 calculate_indicators() 增强的 DataFrame
# ---------------------------------------------------------------------------

STRATEGY_NAMES = {
    "macd_cross": "MACD 金叉死叉",
    "multi_indicator": "多指标共振",
    "boll_breakout": "布林带突破",
    "ma_trend": "均线趋势跟踪",
}


def _macd_cross_signal(df: pd.DataFrame, params: Optional[Dict[str, Any]] = None) -> Tuple[pd.Series, pd.Series]:
    """MACD 金叉买、死叉卖。params: fast/slow/signal 为 MACD 周期。"""
    fast = int(params.get("fast", 12)) if params else 12
    slow = int(params.get("slow", 26)) if params else 26
    signal = int(params.get("signal", 9)) if params else 9

    if fast == 12 and slow == 26 and signal == 9:
        dif = df["macd_dif"]
        dea = df["macd_dea"]
    else:
        from ta.trend import MACD

        macd = MACD(close=df["close"], window_fast=fast, window_slow=slow, window_sign=signal)
        dif = macd.macd()
        dea = macd.macd_signal()

    buy = (dif > dea) & (dif.shift(1) <= dea.shift(1))
    sell = (dif < dea) & (dif.shift(1) >= dea.shift(1))
    return buy.fillna(False), sell.fillna(False)


def _multi_indicator_signal(df: pd.DataFrame, params: Optional[Dict[str, Any]] = None) -> Tuple[pd.Series, pd.Series]:
    """多指标共振：复用 rule_engine 的 7 条规则逻辑。
    参数: vol_window(量能均线), ma_slow(慢线), ma_long(长线), ma_ratio,
          rsi_low, rsi_high, vol_ratio。"""
    vol_window = int((params or {}).get("vol_window", 20))
    ma_slow = int((params or {}).get("ma_slow", 20))
    ma_long = int((params or {}).get("ma_long", 60))
    ma_ratio = float((params or {}).get("ma_ratio", 0.98))
    rsi_low = float((params or {}).get("rsi_low", 30))
    rsi_high = float((params or {}).get("rsi_high", 70))
    vol_ratio = float((params or {}).get("vol_ratio", 1.05))

    vol_ma20 = df["volume"].rolling(vol_window).mean()
    prev_hist = df["macd_hist"].shift(1)

    buy = (
        (df["close"] > df["ma20"])
        & (df["ma20"] >= df["ma60"] * ma_ratio)
        & (df["rsi"] > rsi_low) & (df["rsi"] < rsi_high)
        & ((df["macd_hist"] > 0) | (df["macd_hist"] > prev_hist))
        & (df["volume"] >= vol_ma20 * vol_ratio)
    )
    sell = (
        (df["rsi"] >= rsi_high)
        | ((df["close"] < df["ma20"]) & (df["macd_hist"] < prev_hist))
    )
    return buy.fillna(False), sell.fillna(False)


def _boll_breakout_signal(df: pd.DataFrame, params: Optional[Dict[str, Any]] = None) -> Tuple[pd.Series, pd.Series]:
    """布林带突破：跌破下轨后反弹买入，触上轨或 RSI 超买卖出。参数: rsi_high。"""
    rsi_high = float((params or {}).get("rsi_high", 70))
    prev_close = df["close"].shift(1)
    prev_lower = df["boll_lower"].shift(1)
    # 买入：前一天收盘低于下轨，当天收盘回升到下轨之上（反弹确认）
    buy = (prev_close < prev_lower) & (df["close"] >= df["boll_lower"])
    # 卖出：收盘价触上轨 或 RSI 超买
    sell = (df["close"] >= df["boll_upper"]) | (df["rsi"] >= rsi_high)
    return buy.fillna(False), sell.fillna(False)


def _ma_trend_signal(df: pd.DataFrame, params: Optional[Dict[str, Any]] = None) -> Tuple[pd.Series, pd.Series]:
    """均线趋势：MA 上穿且价格在慢线上方买入，下穿或跌破卖出。参数: fast_ma, slow_ma。"""
    fast_ma = int((params or {}).get("fast_ma", 5))
    slow_ma = int((params or {}).get("slow_ma", 20))

    if fast_ma == 5 and slow_ma == 20:
        fast = df["ma5"]
        slow = df["ma20"]
    else:
        from ta.trend import SMAIndicator

        fast = SMAIndicator(close=df["close"], window=fast_ma).sma_indicator()
        slow = SMAIndicator(close=df["close"], window=slow_ma).sma_indicator()

    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    buy = (fast > slow) & (prev_fast <= prev_slow) & (df["close"] > slow)
    sell = ((fast < slow) & (prev_fast >= prev_slow)) | (df["close"] < slow)
    return buy.fillna(False), sell.fillna(False)


STRATEGY_FUNCTIONS = {
    "macd_cross": _macd_cross_signal,
    "multi_indicator": _multi_indicator_signal,
    "boll_breakout": _boll_breakout_signal,
    "ma_trend": _ma_trend_signal,
}

# ---------------------------------------------------------------------------
# 模拟交易引擎（所有策略共用）
# ---------------------------------------------------------------------------


def _simulate_trades(
    df: pd.DataFrame,
    buy_mask: pd.Series,
    sell_mask: pd.Series,
    initial_cash: float,
) -> Dict[str, Any]:
    """根据买卖信号模拟交易，返回 trades / equity_curve / max_drawdown。"""
    trades: List[Dict[str, Any]] = []
    equity_curve: List[Dict[str, Any]] = []
    signals: List[Dict[str, Any]] = []

    cash = initial_cash
    holding = 0.0
    buy_price = 0.0
    peak_value = initial_cash
    max_drawdown = 0.0

    for idx, row in df.iterrows():
        price = float(row["close"])
        date_str = str(row["date"])

        # 金叉买入
        if buy_mask.iloc[idx] and holding == 0 and cash > 0:
            shares = (cash * 0.95) / price
            shares = int(shares / 100) * 100  # 整手
            if shares >= 100:
                cost = shares * price
                cash -= cost
                holding = shares
                buy_price = price
                trades.append({
                    "date": date_str,
                    "type": "买入",
                    "price": round(price, 3),
                    "shares": int(shares),
                    "cost": round(cost, 2),
                    "cash_after": round(cash, 2),
                })
                signals.append({"date": date_str, "type": "buy", "price": round(price, 3)})

        # 死叉卖出
        elif sell_mask.iloc[idx] and holding > 0:
            revenue = holding * price
            pnl = revenue - (holding * buy_price)
            pnl_pct = (price - buy_price) / buy_price * 100
            cash += revenue
            trades.append({
                "date": date_str,
                "type": "卖出",
                "price": round(price, 3),
                "shares": int(holding),
                "revenue": round(revenue, 2),
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 2),
                "cash_after": round(cash, 2),
            })
            signals.append({"date": date_str, "type": "sell", "price": round(price, 3)})
            holding = 0
            buy_price = 0.0

        # 记录资金曲线
        total_value = cash + holding * price
        equity_curve.append({"date": date_str, "value": round(total_value, 2)})

        # 更新回撤
        if total_value > peak_value:
            peak_value = total_value
        drawdown = (peak_value - total_value) / peak_value * 100
        if drawdown > max_drawdown:
            max_drawdown = drawdown

    # 最终持仓按市价平仓
    if holding > 0:
        final_price = float(df.iloc[-1]["close"])
        revenue = holding * final_price
        pnl = revenue - (holding * buy_price)
        pnl_pct = (final_price - buy_price) / buy_price * 100
        cash += revenue
        trades.append({
            "date": str(df.iloc[-1]["date"]),
            "type": "平仓",
            "price": round(final_price, 3),
            "shares": int(holding),
            "revenue": round(revenue, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "cash_after": round(cash, 2),
        })
        signals.append({"date": str(df.iloc[-1]["date"]), "type": "sell", "price": round(final_price, 3)})

    return {
        "trades": trades,
        "signals": signals,
        "equity_curve": equity_curve,
        "final_cash": round(cash, 2),
        "max_drawdown_pct": round(max_drawdown, 2),
    }


# ---------------------------------------------------------------------------
# 基准计算（买入持有）
# ---------------------------------------------------------------------------


def _compute_benchmark(df: pd.DataFrame, initial_cash: float) -> Dict[str, Any]:
    """计算买入持有基准：如果从头到尾一直拿着不动。"""
    first_close = float(df.iloc[0]["close"])
    last_close = float(df.iloc[-1]["close"])
    shares = int(initial_cash / first_close / 100) * 100  # 整手
    if shares < 100:
        shares = 0
    cost = shares * first_close
    final_value = shares * last_close + (initial_cash - cost)
    return_pct = (final_value - initial_cash) / initial_cash * 100

    return {
        "initial_investment": round(initial_cash, 2),
        "shares_bought": int(shares),
        "avg_cost": round(first_close, 3),
        "final_value": round(final_value, 2),
        "total_return_pct": round(return_pct, 2),
    }


# ---------------------------------------------------------------------------
# K线数据格式化（供前端图表使用）
# ---------------------------------------------------------------------------


def _format_kline(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """将 DataFrame 转为前端 lightweight-charts 可用的 K 线数组。"""
    result = []
    for _, row in df.iterrows():
        result.append({
            "date": str(row["date"]),
            "open": round(float(row["open"]), 3),
            "high": round(float(row["high"]), 3),
            "low": round(float(row["low"]), 3),
            "close": round(float(row["close"]), 3),
            "volume": float(row["volume"]),
        })
    return result


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------


def run_backtest(
    code: str,
    strategy: str = "macd_cross",
    days: int = 365,
    initial_cash: float = 100000.0,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """策略回测主函数。params 为策略参数覆盖，未指定时用默认参数。"""
    if strategy not in STRATEGY_FUNCTIONS:
        return {"error": f"未知策略: {strategy}，可选: {', '.join(STRATEGY_FUNCTIONS.keys())}"}

    df = get_kline(code, days=days)
    if df.empty:
        return {"error": f"股票 {code} 无数据"}

    # 统一计算所有指标（和推荐系统共用同一个调用）
    df = calculate_indicators(df)

    # 生成策略信号
    signal_func = STRATEGY_FUNCTIONS[strategy]
    buy_mask, sell_mask = signal_func(df, params or {})

    # 模拟交易
    sim = _simulate_trades(df, buy_mask, sell_mask, initial_cash)

    # 基准
    benchmark = _compute_benchmark(df, initial_cash)

    # 统计
    trades = sim["trades"]
    win_trades = [t for t in trades if t.get("pnl", 0) > 0]
    loss_trades = [t for t in trades if t.get("pnl", 0) < 0]

    total_pnl = sim["final_cash"] - initial_cash
    total_pnl_pct = total_pnl / initial_cash * 100

    # 结果自动落库（失败不影响回测本身）
    try:
        _save_backtest_run(
            code=code,
            strategy_key=strategy,
            strategy_name=STRATEGY_NAMES[strategy],
            days=days,
            initial_cash=initial_cash,
            final_cash=sim["final_cash"],
            total_pnl=total_pnl,
            total_pnl_pct=total_pnl_pct,
            total_trades=len(trades),
            win_trades=len(win_trades),
            loss_trades=len(loss_trades),
            win_rate=round(len(win_trades) / max(len(trades), 1) * 100, 1),
            max_drawdown_pct=sim["max_drawdown_pct"],
            benchmark_return_pct=benchmark["total_return_pct"],
            params=params or {},
        )
    except Exception:
        pass

    return {
        "code": code,
        "strategy": STRATEGY_NAMES[strategy],
        "strategy_key": strategy,
        "period_days": days,
        "initial_cash": initial_cash,
        "final_cash": sim["final_cash"],
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "total_trades": len(trades),
        "win_trades": len(win_trades),
        "loss_trades": len(loss_trades),
        "win_rate": round(len(win_trades) / max(len(trades), 1) * 100, 1),
        "max_drawdown_pct": sim["max_drawdown_pct"],
        "trades": trades[-30:],
        "kline": _format_kline(df),
        "signals": sim["signals"],
        "equity_curve": sim["equity_curve"],
        "benchmark": benchmark,
        "params": params or {},
        "strategies_available": [{"key": k, "name": v} for k, v in STRATEGY_NAMES.items()],
    }


# ---------------------------------------------------------------------------
# 参数扫描与训练/验证研究（阶段 1+2）
# ---------------------------------------------------------------------------


def _expand_param_grid(
    param_grid: Dict[str, List[Any]], max_combos: int
) -> Tuple[List[Dict[str, Any]], bool]:
    """把 param_grid 展开为参数组合列表；超过 max_combos 时截断。返回 (combos, truncated)。"""
    keys = list(param_grid.keys())
    if not keys:
        return [], False
    all_combos = list(itertools.product(*[param_grid[k] for k in keys]))
    truncated = len(all_combos) > max_combos
    combos = all_combos[:max_combos] if truncated else all_combos
    return [dict(zip(keys, values)) for values in combos], truncated


def _summary_stats(sim: Dict[str, Any], initial_cash: float) -> Dict[str, Any]:
    """从 _simulate_trades 的结果汇总收益统计。"""
    trades = sim["trades"]
    win_trades = [t for t in trades if t.get("pnl", 0) > 0]
    loss_trades = [t for t in trades if t.get("pnl", 0) < 0]
    total_pnl = sim["final_cash"] - initial_cash
    return {
        "total_pnl": total_pnl,
        "total_pnl_pct": round(total_pnl / initial_cash * 100, 2),
        "total_trades": len(trades),
        "win_trades": len(win_trades),
        "loss_trades": len(loss_trades),
        "win_rate": round(len(win_trades) / max(len(trades), 1) * 100, 1),
        "max_drawdown_pct": sim["max_drawdown_pct"],
        "final_cash": sim["final_cash"],
    }


def scan_strategy(
    code: str,
    strategy: str = "macd_cross",
    param_grid: Optional[Dict[str, List[Any]]] = None,
    days: int = 365,
    initial_cash: float = 100000.0,
    max_combos: int = 256,
) -> Dict[str, Any]:
    """参数扫描：展开 param_grid 逐一跑 run_backtest（自动落库），按收益率排序返回。"""
    if strategy not in STRATEGY_FUNCTIONS:
        return {"error": f"未知策略: {strategy}，可选: {', '.join(STRATEGY_FUNCTIONS.keys())}"}

    combos, truncated = _expand_param_grid(param_grid or {}, max_combos)
    if not combos:
        return {"error": "param_grid 必须包含至少一个候选参数"}

    results: List[Dict[str, Any]] = []
    failed = 0
    for combo in combos:
        r = run_backtest(code, strategy=strategy, days=days, initial_cash=initial_cash, params=combo)
        if "error" in r:
            failed += 1
            continue
        results.append({
            "params": combo,
            "total_pnl_pct": r["total_pnl_pct"],
            "total_trades": r["total_trades"],
            "win_rate": r["win_rate"],
            "max_drawdown_pct": r["max_drawdown_pct"],
            "benchmark_return_pct": r["benchmark"]["total_return_pct"],
        })

    results.sort(key=lambda x: x["total_pnl_pct"], reverse=True)

    warning_parts = []
    if truncated:
        warning_parts.append(f"参数组合数超过上限 {max_combos}，仅评估前 {max_combos} 个组合")
    if failed:
        warning_parts.append(f"{failed} 个组合回测失败已跳过")
    warning = "；".join(warning_parts)

    return {
        "code": code,
        "strategy": strategy,
        "strategy_name": STRATEGY_NAMES[strategy],
        "combos_evaluated": len(results),
        "truncated": truncated,
        "warning": warning,
        "results": results,
    }


def research_backtest(
    code: str,
    strategy: str = "macd_cross",
    param_grid: Optional[Dict[str, List[Any]]] = None,
    days: int = 730,
    initial_cash: float = 100000.0,
    train_ratio: float = 0.75,
    max_combos: int = 150,
    top_n: int = 8,
) -> Dict[str, Any]:
    """训练/验证分离研究：K 线与指标只拉取计算一次，
    训练段筛选 top_n 候选，再在验证段评估，防过拟合。全部组合照常落库。"""
    if strategy not in STRATEGY_FUNCTIONS:
        return {"error": f"未知策略: {strategy}，可选: {', '.join(STRATEGY_FUNCTIONS.keys())}"}
    if not 0.0 < train_ratio < 1.0:
        return {"error": "train_ratio 必须在 (0, 1) 之间"}

    combos, truncated = _expand_param_grid(param_grid or {}, max_combos)
    if not combos:
        return {"error": "param_grid 必须包含至少一个候选参数"}

    df = get_kline(code, days=days)
    if df.empty:
        return {"error": f"股票 {code} 无数据"}
    df = calculate_indicators(df)

    total = len(df)
    train_end = int(total * train_ratio)
    if train_end < 2 or total - train_end < 2:
        return {"error": f"K 线数据不足：共 {total} 条，无法按 train_ratio={train_ratio} 切分训练/验证段"}

    signal_func = STRATEGY_FUNCTIONS[strategy]
    benchmark = _compute_benchmark(df, initial_cash)
    signal_func_name = STRATEGY_NAMES[strategy]

    def _persist(stats: Dict[str, Any], params: Dict[str, Any], mode: str) -> None:
        try:
            _save_backtest_run(
                code=code,
                strategy_key=strategy,
                strategy_name=signal_func_name,
                days=days,
                initial_cash=initial_cash,
                final_cash=stats["final_cash"],
                total_pnl=stats["total_pnl"],
                total_pnl_pct=stats["total_pnl_pct"],
                total_trades=stats["total_trades"],
                win_trades=stats["win_trades"],
                loss_trades=stats["loss_trades"],
                win_rate=stats["win_rate"],
                max_drawdown_pct=stats["max_drawdown_pct"],
                benchmark_return_pct=benchmark["total_return_pct"],
                params={"params": params, "mode": mode, "train_ratio": train_ratio},
            )
        except Exception:
            pass

    train_records: List[Dict[str, Any]] = []
    for combo in combos:
        buy_mask, sell_mask = signal_func(df, combo)
        # 训练段：指标在训练段内自 warmup 后生效（信号函数已 fillna(False)）
        train_df = df.iloc[:train_end].reset_index(drop=True)
        train_stats = _summary_stats(
            _simulate_trades(
                train_df,
                buy_mask.iloc[:train_end].reset_index(drop=True),
                sell_mask.iloc[:train_end].reset_index(drop=True),
                initial_cash,
            ),
            initial_cash,
        )
        _persist(train_stats, combo, "train")
        train_records.append({"params": combo, "train": train_stats})

    train_records.sort(key=lambda x: x["train"]["total_pnl_pct"], reverse=True)
    candidates = train_records[:max(1, min(top_n, len(train_records)))]

    top_candidates: List[Dict[str, Any]] = []
    for rec in candidates:
        combo = rec["params"]
        buy_mask, sell_mask = signal_func(df, combo)
        # 验证段：用全量 df 的指标列（含前导 warmup），只从 train_end 起模拟
        val_df = df.iloc[train_end:].reset_index(drop=True)
        val_stats = _summary_stats(
            _simulate_trades(
                val_df,
                buy_mask.iloc[train_end:].reset_index(drop=True),
                sell_mask.iloc[train_end:].reset_index(drop=True),
                initial_cash,
            ),
            initial_cash,
        )
        _persist(val_stats, combo, "val")
        top_candidates.append({
            "params": combo,
            "train_pnl_pct": rec["train"]["total_pnl_pct"],
            "train_win_rate": rec["train"]["win_rate"],
            "train_drawdown": rec["train"]["max_drawdown_pct"],
            "train_trades": rec["train"]["total_trades"],
            "val_pnl_pct": val_stats["total_pnl_pct"],
            "val_win_rate": val_stats["win_rate"],
            "val_drawdown": val_stats["max_drawdown_pct"],
            "val_trades": val_stats["total_trades"],
        })

    return {
        "code": code,
        "strategy": strategy,
        "strategy_name": signal_func_name,
        "train_ratio": train_ratio,
        "train_days": train_end,
        "valid_days": total - train_end,
        "combos_evaluated": len(combos),
        "truncated": truncated,
        "warning": f"参数组合数超过上限 {max_combos}，仅评估前 {max_combos} 个组合" if truncated else "",
        "top_candidates": top_candidates,
        "train_top_params": [c["params"] for c in top_candidates],
    }


# ---------------------------------------------------------------------------
# 回测结果落库与历史查询
# ---------------------------------------------------------------------------


def _save_backtest_run(
    code: str,
    strategy_key: str,
    strategy_name: str,
    days: int,
    initial_cash: float,
    final_cash: float,
    total_pnl: float,
    total_pnl_pct: float,
    total_trades: int,
    win_trades: int,
    loss_trades: int,
    win_rate: float,
    max_drawdown_pct: float,
    benchmark_return_pct: float,
    params: Optional[Dict[str, Any]] = None,
) -> None:
    import json

    from app.db import get_connection
    from app.services.stock_service import get_stock_name

    conn = get_connection()
    try:
        row = conn.execute("SELECT name FROM stock WHERE code = ?", (code,)).fetchone()
        name = row["name"] if row else ""
        if not name:
            # 兜底：腾讯实时接口取名称；顺带修复该代码的历史空名记录
            name = get_stock_name(code)
            if name:
                conn.execute(
                    "UPDATE backtest_runs SET name = ? WHERE code = ? AND name = ''",
                    (name, code),
                )
        conn.execute(
            """INSERT INTO backtest_runs
               (code, name, strategy_key, strategy_name, days, initial_cash, final_cash,
                total_pnl, total_pnl_pct, total_trades, win_trades, loss_trades,
                win_rate, max_drawdown_pct, benchmark_return_pct, params_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                code, name, strategy_key, strategy_name, days, initial_cash, final_cash,
                round(total_pnl, 2), round(total_pnl_pct, 2), total_trades, win_trades, loss_trades,
                win_rate, max_drawdown_pct, benchmark_return_pct,
                json.dumps(params or {}, ensure_ascii=False),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def list_backtest_runs(limit: int = 20) -> Dict[str, Any]:
    """返回最近回测记录 + 按策略聚合的统计。"""
    from app.db import get_connection

    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, code, name, strategy_key, strategy_name, days, initial_cash,
                      final_cash, total_pnl, total_pnl_pct, total_trades, win_trades,
                      loss_trades, win_rate, max_drawdown_pct, benchmark_return_pct,
                      created_at
               FROM backtest_runs
               ORDER BY id DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
        runs = [dict(r) for r in rows]

        stats = conn.execute(
            """SELECT strategy_key, strategy_name, COUNT(*) AS run_count,
                      ROUND(AVG(total_pnl_pct), 2) AS avg_pnl_pct,
                      ROUND(AVG(win_rate), 1) AS avg_win_rate,
                      ROUND(AVG(max_drawdown_pct), 2) AS avg_max_drawdown,
                      SUM(CASE WHEN total_pnl_pct > 0 THEN 1 ELSE 0 END) AS profitable_runs
               FROM backtest_runs
               GROUP BY strategy_key
               ORDER BY run_count DESC, avg_pnl_pct DESC""",
        ).fetchall()
        strategy_stats = [dict(s) for s in stats]

        total = conn.execute("SELECT COUNT(*) AS c FROM backtest_runs").fetchone()["c"]
        return {"runs": runs, "strategy_stats": strategy_stats, "total_runs": total}
    finally:
        conn.close()
