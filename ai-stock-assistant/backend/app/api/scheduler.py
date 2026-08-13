"""收盘自动回测调度与环境分层分析端点（阶段 4.3 / 4.5 / 5 校准）"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_connection
from app.services.scheduler_service import environment_analysis, run_daily_backtests

router = APIRouter(tags=["scheduler"])


class DailyRunRequest(BaseModel):
    limit: int = 10
    days: int = 365
    strategy: str = "ma_trend"


@router.get("/backtest/environment-analysis")
async def backtest_environment_analysis(days: int = 90):
    try:
        return environment_analysis(days=days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scheduler/daily-run")
async def daily_run(req: DailyRunRequest):
    try:
        result = run_daily_backtests(limit=req.limit, days=req.days, strategy=req.strategy)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calibration/status")
async def calibration_status():
    """查看当前校准状态：规则权重、阈值、验证通过的策略参数。"""
    try:
        from app.services.backtest_research_service import STRATEGY_NAMES
        from app.services.calibrate_service import load_rule_weights

        conn = get_connection()
        try:
            rule_rows = conn.execute(
                "SELECT key, value, value_str, source, calibrated_on, detail FROM rule_params ORDER BY key"
            ).fetchall()
            strat_rows = conn.execute(
                """SELECT strategy_key, params_json, consistency_pct, avg_val_pnl_pct,
                          windows_total, active, created_at
                   FROM strategy_params ORDER BY created_at DESC LIMIT 10"""
            ).fetchall()
        finally:
            conn.close()
        import json

        return {
            "rule_weights_effective": load_rule_weights(),
            "rule_params": [dict(r) for r in rule_rows],
            "strategy_params": [
                {
                    **dict(r),
                    "params": json.loads(r["params_json"]),
                }
                for r in strat_rows
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calibration/run-rules")
async def calibration_run_rules():
    """手动触发规则权重校准（免费，拉行情做 IC 分析，约 1-3 分钟）。"""
    try:
        from app.services.calibrate_service import apply_rule_params, calibrate_rule_weights

        result = calibrate_rule_weights()
        if "error" in result:
            return {"error": result["error"]}
        n = apply_rule_params(result)
        return {**result, "applied": n}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
