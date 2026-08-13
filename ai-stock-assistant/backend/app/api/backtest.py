import json
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.backtest_research_service import batch_scan, walk_forward
from app.services.backtest_service import (
    list_backtest_runs,
    research_backtest,
    run_backtest,
    scan_strategy,
)

router = APIRouter(prefix="/backtest", tags=["backtest"])


class ScanRequest(BaseModel):
    code: str
    strategy: str = "macd_cross"
    param_grid: Dict[str, List[Any]] = {}
    days: int = 365
    initial_cash: float = 100000.0
    max_combos: int = 256


class ResearchRequest(BaseModel):
    code: str
    strategy: str = "macd_cross"
    param_grid: Dict[str, List[Any]] = {}
    days: int = 730
    initial_cash: float = 100000.0
    train_ratio: float = 0.75
    max_combos: int = 150


@router.get("/runs")
async def backtest_runs(limit: int = 20):
    try:
        return list_backtest_runs(limit=max(1, min(limit, 100)))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan")
async def backtest_scan(req: ScanRequest):
    try:
        result = scan_strategy(
            req.code,
            strategy=req.strategy,
            param_grid=req.param_grid,
            days=req.days,
            initial_cash=req.initial_cash,
            max_combos=req.max_combos,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/research")
async def backtest_research(req: ResearchRequest):
    try:
        result = research_backtest(
            req.code,
            strategy=req.strategy,
            param_grid=req.param_grid,
            days=req.days,
            initial_cash=req.initial_cash,
            train_ratio=req.train_ratio,
            max_combos=req.max_combos,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{code}")
async def backtest(
    code: str,
    strategy: str = "macd_cross",
    days: int = 365,
    initial_cash: float = 100000.0,
    params: str = "{}",
):
    try:
        try:
            params_dict = json.loads(params) if params else {}
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="params 必须是合法的 JSON")
        result = run_backtest(code, strategy=strategy, days=days, initial_cash=initial_cash, params=params_dict)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BatchScanRequest(BaseModel):
    codes: List[str]
    strategy: str = "macd_cross"
    param_grid: Dict[str, List[Any]] = {}
    days: int = 365
    initial_cash: float = 100000.0
    max_combos: int = 64


class WalkForwardRequest(BaseModel):
    code: str
    strategy: str = "macd_cross"
    param_grid: Dict[str, List[Any]] = {}
    days: int = 730
    initial_cash: float = 100000.0
    window: int = 120
    step: int = 20
    max_combos: int = 150
    top_n: int = 5


@router.post("/batch-scan")
async def backtest_batch_scan(req: BatchScanRequest):
    try:
        if not req.codes:
            raise HTTPException(status_code=400, detail="codes 不能为空")
        if not req.param_grid:
            raise HTTPException(status_code=400, detail="param_grid 不能为空")
        result = batch_scan(
            req.codes,
            strategy=req.strategy,
            param_grid=req.param_grid,
            days=req.days,
            initial_cash=req.initial_cash,
            max_combos=req.max_combos,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/walkforward")
async def backtest_walk_forward(req: WalkForwardRequest):
    try:
        if not req.param_grid:
            raise HTTPException(status_code=400, detail="param_grid 不能为空")
        result = walk_forward(
            req.code,
            strategy=req.strategy,
            param_grid=req.param_grid,
            days=req.days,
            initial_cash=req.initial_cash,
            window=req.window,
            step=req.step,
            max_combos=req.max_combos,
            top_n=req.top_n,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
