from typing import Optional

from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import MonthlyPnL, TradeListResponse, TradeStats
from app.services.portfolio_service import get_monthly_pnl, get_trade_stats, list_trades

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("", response_model=TradeListResponse)
async def api_list_trades(
    limit: int = 50,
    trade_type: Optional[str] = None,
    sort: str = "desc",
    code: Optional[str] = None,
):
    try:
        items = list_trades(limit=limit, trade_type=trade_type, sort=sort, code=code)
        return TradeListResponse(count=len(items), items=items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=TradeStats)
async def api_trade_stats():
    try:
        stats = get_trade_stats()
        return TradeStats(**stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monthly", response_model=list[MonthlyPnL])
async def api_monthly_pnl():
    try:
        return get_monthly_pnl()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
