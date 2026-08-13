"""收盘自动回测调度 + 环境分层分析 + 懒触发（阶段 4.3 / 4.5 / 5）"""
import logging
import os
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import app.config as cfg  # noqa: F401
from app.db import get_connection
from app.services.backtest_research_service import get_active_strategy_params
from app.services.backtest_service import STRATEGY_NAMES, scan_strategy
from app.services.indicator_service import detect_market_phase
from app.services.stock_service import get_stock_name

logger = logging.getLogger(__name__)

# 懒触发窗口：当天 15:10 之后首次打开应用时自动跑（回测免费；推荐可选，见 AUTO_RECOMMEND_ON_OPEN）
LAZY_TRIGGER_HOUR = int(os.getenv("LAZY_TRIGGER_HOUR", "15"))
LAZY_TRIGGER_MINUTE = int(os.getenv("LAZY_TRIGGER_MINUTE", "10"))
# 自动推荐开关：为 candidate_log 对照组累积数据（消耗 LLM token）
AUTO_RECOMMEND_ON_OPEN = os.getenv("AUTO_RECOMMEND_ON_OPEN", "true").lower() == "true"
AUTO_RECOMMEND_CANDIDATE_LIMIT = int(os.getenv("AUTO_RECOMMEND_CANDIDATE_LIMIT", "5"))
AUTO_RECOMMEND_TOP_N = int(os.getenv("AUTO_RECOMMEND_TOP_N", "3"))

STRATEGY_PARAM_GRIDS: Dict[str, Dict[str, List[Any]]] = {
    "ma_trend": {"fast_ma": [5, 10, 20], "slow_ma": [20, 40, 60]},
    "macd_cross": {"fast": [12, 16], "slow": [26, 32], "signal": [9]},
    "multi_indicator": {"ma_slow": [20, 30], "ma_long": [60, 90]},
    "boll_breakout": {"rsi_high": [65, 70, 75]},
}

ENV_SCORE_MAP = {"bullish": 90, "neutral": 60, "bearish": 30, "unknown": 0}

_job_lock = threading.Lock()
_checked_day: str = ""


def environment_analysis(days: int = 90) -> Dict[str, Any]:
    """从 backtest_runs 按环境分层聚合回测表现（只统计 env_status 非空、最近 days 天的记录）。"""
    days = max(1, int(days))
    conn = get_connection()
    try:
        window_sql = "env_status != '' AND created_at >= datetime('now', ?, 'localtime')"
        params = (f"-{days} days",)

        all_row = conn.execute(
            f"""SELECT COUNT(*) AS run_count,
                       ROUND(AVG(total_pnl_pct), 2) AS avg_pnl_pct,
                       ROUND(AVG(win_rate), 1) AS avg_win_rate,
                       ROUND(AVG(max_drawdown_pct), 2) AS avg_max_drawdown,
                       SUM(CASE WHEN total_pnl_pct > 0 THEN 1 ELSE 0 END) AS profitable_runs
                FROM backtest_runs
                WHERE {window_sql}""",
            params,
        ).fetchone()
        if not all_row or not all_row["run_count"]:
            return {"days": days, "groups": [], "best_env": "无数据", "worst_env": "无数据"}

        all_group = dict(all_row)
        all_group["env_status"] = "(全部)"

        rows = conn.execute(
            f"""SELECT env_status AS env_status,
                       COUNT(*) AS run_count,
                       ROUND(AVG(total_pnl_pct), 2) AS avg_pnl_pct,
                       ROUND(AVG(win_rate), 1) AS avg_win_rate,
                       ROUND(AVG(max_drawdown_pct), 2) AS avg_max_drawdown,
                       SUM(CASE WHEN total_pnl_pct > 0 THEN 1 ELSE 0 END) AS profitable_runs
                FROM backtest_runs
                WHERE {window_sql}
                GROUP BY env_status
                ORDER BY avg_pnl_pct DESC""",
            params,
        ).fetchall()
        groups = [dict(r) for r in rows]

        return {
            "days": days,
            "groups": [all_group] + groups,
            "best_env": groups[0]["env_status"] if groups else "无数据",
            "worst_env": groups[-1]["env_status"] if groups else "无数据",
        }
    finally:
        conn.close()


def run_daily_backtests(limit: int = 10, days: int = 365, strategy: str = "ma_trend") -> Dict[str, Any]:
    """收盘后对最新一批推荐股票做策略参数扫描（自动落库），并尽力回填环境分层。"""
    limit = max(1, int(limit))
    days = max(30, int(days))
    run_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if strategy not in STRATEGY_NAMES:
        return {"error": f"未知策略: {strategy}，可选: {', '.join(STRATEGY_NAMES.keys())}"}

    codes = _latest_recommendation_codes(limit)
    if not codes:
        return {
            "run_at": run_at,
            "env_status": "unknown",
            "env_score": 0,
            "codes_scanned": [],
            "total_runs": 0,
            "env_backfilled": False,
            "env_note": "recommendation 表中无推荐记录，本次未运行回测",
        }

    env_status = detect_market_phase()
    env_score = ENV_SCORE_MAP.get(env_status, 0)
    env_ok = env_status not in ("", "unknown")
    window_start = datetime.now() - timedelta(seconds=30)

    # 闭环 2：优先使用 walk-forward 验证通过的参数（无则回退默认网格）
    active_params = get_active_strategy_params(strategy)
    param_grid = (
        active_params["params"] if active_params else STRATEGY_PARAM_GRIDS[strategy]
    )
    if active_params:
        env_note_prefix = (
            f"使用 walk-forward 参数 (consistency={active_params['consistency_pct']}%, "
            f"avg_val={active_params['avg_val_pnl_pct']}%)"
        )
    else:
        env_note_prefix = "使用默认参数网格（尚无验证通过的参数）"

    codes_scanned: List[Dict[str, Any]] = []
    total_runs = 0
    for code, name in codes:
        try:
            result = scan_strategy(
                code, strategy=strategy, param_grid=param_grid, days=days
            )
        except Exception as exc:
            codes_scanned.append({"code": code, "name": name, "best_params": None, "best_pnl_pct": None, "error": str(exc)})
            continue
        if "error" in result:
            codes_scanned.append({"code": code, "name": name, "best_params": None, "best_pnl_pct": None, "error": result["error"]})
            continue
        best = result["results"][0] if result.get("results") else None
        total_runs += result.get("combos_evaluated", 0)
        codes_scanned.append({
            "code": code,
            "name": name,
            "best_params": best["params"] if best else None,
            "best_pnl_pct": best["total_pnl_pct"] if best else None,
        })

    backfilled = False
    if env_ok and codes_scanned:
        backfilled = _backfill_env(
            env_status, env_score, [c["code"] for c in codes_scanned], strategy, window_start
        )

    return {
        "run_at": run_at,
        "env_status": env_status,
        "env_score": env_score,
        "codes_scanned": codes_scanned,
        "total_runs": total_runs,
        "env_backfilled": backfilled,
        "param_source": env_note_prefix,
        "env_note": "" if backfilled else "环境回填跳过：detect_market_phase 未返回有效环境",
    }


def _latest_recommendation_codes(limit: int) -> List[Tuple[str, str]]:
    """读取 recommendation 表推荐日期最新一批的股票代码（去重，最多 limit 只）。"""
    conn = get_connection()
    try:
        latest = conn.execute("SELECT MAX(recommend_date) AS d FROM recommendation").fetchone()
        if not latest or not latest["d"]:
            return []
        rows = conn.execute(
            """SELECT code, name FROM recommendation
               WHERE recommend_date = ?
               ORDER BY rank, id
               LIMIT ?""",
            (latest["d"], limit * 3),
        ).fetchall()
    finally:
        conn.close()

    seen = set()
    result: List[Tuple[str, str]] = []
    for r in rows:
        code = r["code"]
        if code in seen:
            continue
        seen.add(code)
        name = r["name"] or ""
        if not name:
            try:
                name = get_stock_name(code)
            except Exception as e:
                logger.warning("获取股票名称失败: %s", e)
                name = ""
        result.append((code, name))
        if len(result) >= limit:
            break
    return result


def _backfill_env(env_status: str, env_score: int, codes: List[str], strategy: str, window_start: datetime) -> bool:
    """按 code+strategy_key+created_at 时间窗口尽力回填 env_status/env_score（只填空值）。"""
    conn = get_connection()
    try:
        start = window_start.strftime("%Y-%m-%d %H:%M:%S")
        updated = 0
        for code in codes:
            cur = conn.execute(
                """UPDATE backtest_runs SET env_status = ?, env_score = ?
                   WHERE code = ? AND strategy_key = ?
                     AND created_at >= ? AND env_status = ''""",
                (env_status, env_score, code, strategy, start),
            )
            updated += cur.rowcount
        conn.commit()
        return updated > 0
    except Exception as e:
        logger.warning("回填环境信息失败: %s", e)
        return False
    finally:
        conn.close()


def _has_run_today(day: str, job: str = "daily-backtest") -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            # 超过 2 小时仍为 running 的视为崩溃僵尸记录，不阻止当日重试
            """SELECT 1 FROM daily_job_log WHERE day = ? AND job = ?
               AND NOT (status = 'running' AND triggered_at <= datetime('now', 'localtime', '-2 hours'))""",
            (day, job),
        ).fetchone()
        return row is not None
    except Exception as e:
        logger.warning("检查今日任务是否已运行失败: %s", e)
        return False
    finally:
        conn.close()


def _claim_job(day: str, job: str = "daily-backtest") -> bool:
    """原子抢占当天任务（INSERT OR IGNORE + 复合主键），返回是否抢到。"""
    conn = get_connection()
    try:
        # 崩溃恢复：清除超过 2 小时仍为 running 的僵尸记录，使当日任务可重新认领
        conn.execute(
            """DELETE FROM daily_job_log
               WHERE day = ? AND job = ? AND status = 'running'
                 AND triggered_at <= datetime('now', 'localtime', '-2 hours')""",
            (day, job),
        )
        cur = conn.execute(
            "INSERT OR IGNORE INTO daily_job_log (day, job, status) VALUES (?, ?, 'running')",
            (day, job),
        )
        conn.commit()
        return cur.rowcount == 1
    except Exception as e:
        logger.warning("抢占任务失败: %s", e)
        return False
    finally:
        conn.close()


def _finish_job(day: str, detail: str, job: str = "daily-backtest") -> None:
    conn = get_connection()
    try:
        conn.execute(
            """UPDATE daily_job_log
               SET status = 'done', finished_at = datetime('now', 'localtime'), detail = ?
               WHERE day = ? AND job = ?""",
            (detail[:2000], day, job),
        )
        conn.commit()
    except Exception as e:
        logger.warning("完成任务记录失败: %s", e)
        pass
    finally:
        conn.close()


def _has_recommendation_today(day: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT 1 FROM recommendation_run WHERE recommend_date = ? LIMIT 1", (day,)
        ).fetchone()
        return row is not None
    except Exception as e:
        logger.warning("检查今日推荐是否已存在失败: %s", e)
        return False
    finally:
        conn.close()


def _auto_recommend_once(day: str) -> str:
    """当天无推荐时跑一次轻量推荐（为 candidate_log 对照组累积数据，消耗 LLM token）。"""
    if _has_recommendation_today(day):
        return "recommendation already exists"
    try:
        from app.services.market_service import assess_market_environment
        from app.services.recommend_service import build_recommendations, persist_recommendation_report

        env = assess_market_environment()
        report = build_recommendations(
            candidate_limit=AUTO_RECOMMEND_CANDIDATE_LIMIT,
            top_n=AUTO_RECOMMEND_TOP_N,
            min_rule_score=60,
            env_status=env.get("status"),
            env_score=env.get("score"),
        )
        report.env_status = env.get("status")
        report.env_score = env.get("score")
        report.parameters["env_status"] = env.get("status")
        report.parameters["env_score"] = env.get("score")
        persist_recommendation_report(report)
        return f"recommendation done (candidates={report.candidate_count}, recs={report.count}, cost={report.usage_summary.cost_rmb:.3f}元)"
    except Exception as exc:
        return f"recommendation failed: {exc}"


def _maybe_calibrate_rules(day: str) -> str:
    """闭环 1：每 RULE_CALIBRATE_INTERVAL_DAYS 天自动重校准规则权重（免费，纯行情+pandas）。"""
    try:
        interval = int(os.getenv("RULE_CALIBRATE_INTERVAL_DAYS", "5"))
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT calibrated_on FROM rule_params WHERE key = 'weight.close above MA20' AND source = 'calibrated'"
            ).fetchone()
        finally:
            conn.close()
        if row and row["calibrated_on"]:
            last = datetime.strptime(row["calibrated_on"], "%Y-%m-%d")
            if (datetime.now() - last).days < interval:
                return f"rule calibration skipped (last={row['calibrated_on']})"
        from app.services.calibrate_service import apply_rule_params, calibrate_rule_weights

        result = calibrate_rule_weights()
        if "error" in result:
            return f"rule calibration failed: {result['error']}"
        n = apply_rule_params(result)
        return f"rule calibration done (samples={result['samples']}, weights updated={n}, {result['elapsed_seconds']}s)"
    except Exception as exc:
        return f"rule calibration error: {exc}"


def _maybe_refresh_strategy_params(day: str, strategy: str = "ma_trend") -> str:
    """闭环 2：每 STRATEGY_CALIBRATE_INTERVAL_DAYS 天对最新推荐股票跑一次 walk-forward 刷新参数。"""
    try:
        interval = int(os.getenv("STRATEGY_CALIBRATE_INTERVAL_DAYS", "3"))
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT created_at FROM strategy_params WHERE strategy_key = ? ORDER BY created_at DESC LIMIT 1",
                (strategy,),
            ).fetchone()
        finally:
            conn.close()
        if row and row["created_at"]:
            last = datetime.strptime(row["created_at"], "%Y-%m-%d %H:%M:%S")
            if (datetime.now() - last).days < interval:
                return f"strategy refresh skipped (last={row['created_at'][:10]})"
        from app.services.backtest_research_service import walk_forward

        codes = _latest_recommendation_codes(1)
        if not codes:
            return "strategy refresh skipped (no recommendations)"
        code, _ = codes[0]
        result = walk_forward(
            code, strategy=strategy,
            param_grid=STRATEGY_PARAM_GRIDS[strategy],
            days=730, window=120, step=20, max_combos=150, top_n=5,
        )
        if "error" in result:
            return f"strategy refresh failed: {result['error']}"
        return (
            f"strategy refresh done ({code}, {result['summary']['windows_total']} windows, "
            f"consistency={result['summary']['consistency_pct']}%, "
            f"active={result.get('active', 0)})"
        )
    except Exception as exc:
        return f"strategy refresh error: {exc}"


def _run_daily_job(day: str) -> None:
    detail_parts: List[str] = []
    if AUTO_RECOMMEND_ON_OPEN:
        detail_parts.append(_auto_recommend_once(day))
    detail_parts.append(_maybe_calibrate_rules(day))
    detail_parts.append(_maybe_refresh_strategy_params(day))
    try:
        result = run_daily_backtests(limit=10, days=365, strategy="ma_trend")
        if result.get("error"):
            detail_parts.append(f"backtest error: {result['error']}")
        else:
            detail_parts.append(
                f"backtest runs={result.get('total_runs', 0)}, env={result.get('env_status', 'unknown')}, "
                f"params={result.get('param_source', 'default')}"
            )
    except Exception as exc:
        detail_parts.append(f"backtest failed: {exc}")
    _finish_job(day, " | ".join(p for p in detail_parts if p))


def maybe_run_daily_backtest(now: Optional[datetime] = None) -> bool:
    """懒触发：当天 15:10 之后任意请求进来时调用，满足条件则后台线程跑每日任务（每个自然日只跑一次）。

    返回 True 表示本次触发了后台任务。weekday() < 5 视为交易日（节假日误跑无害：无新行情则结果重复）。
    """
    global _checked_day
    now = now or datetime.now()
    if now.weekday() >= 5:
        return False
    if now.hour < LAZY_TRIGGER_HOUR or (now.hour == LAZY_TRIGGER_HOUR and now.minute < LAZY_TRIGGER_MINUTE):
        return False
    day = now.strftime("%Y-%m-%d")
    with _job_lock:
        if day == _checked_day:
            return False
        _checked_day = day
        if _has_run_today(day):
            return False
        if not _claim_job(day):
            return False
    threading.Thread(target=_run_daily_job, args=(day,), daemon=True).start()
    return True
