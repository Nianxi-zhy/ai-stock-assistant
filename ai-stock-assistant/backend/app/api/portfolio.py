import asyncio
import logging
from datetime import date

from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import (
    AddPositionRequest,
    DailyRoutineResponse,
    HoldingAdvice,
    HoldingCreate,
    HoldingItem,
    HoldingListResponse,
    HoldingsAdviceResponse,
    HoldingUpdate,
    SellOrderRequest,
    TradeListResponse,
    TradeStats,
)
from app.services.daily_service import run_daily_routine
from app.services.portfolio_service import (
    add_position,
    cancel_sell_order,
    confirm_sell,
    create_holding,
    create_sell_order,
    delete_holding,
    get_holdings_advice,
    get_trade_stats,
    list_holdings,
    list_sold_watch,
    list_trades,
    refresh_all_prices,
    sell_holding,
    update_holding,
    update_sell_order_price,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.post("", response_model=HoldingItem)
async def api_create_holding(data: HoldingCreate):
    try:
        return create_holding(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=HoldingListResponse)
async def api_list_holdings(status: str = "holding"):
    try:
        return list_holdings(status=status)
    except Exception:
        logger.exception("获取持仓列表失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/refresh-prices")
async def api_refresh_prices():
    try:
        count = await asyncio.to_thread(refresh_all_prices)
        return {"status": "ok", "updated": count}
    except Exception:
        logger.exception("刷新持仓价格失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/sold-watch")
async def api_sold_watch():
    try:
        return {"items": await asyncio.to_thread(list_sold_watch), "updated_at": date.today().isoformat()}
    except Exception:
        logger.exception("获取已卖出观察列表失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/holdings-advice", response_model=HoldingsAdviceResponse)
async def api_holdings_advice():
    try:
        items = await asyncio.to_thread(get_holdings_advice)
        return HoldingsAdviceResponse(items=[HoldingAdvice(**i) for i in items])
    except Exception:
        logger.exception("获取持仓建议失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/{holding_id:int}/add-position", response_model=HoldingItem)
async def api_add_position(holding_id: int, data: AddPositionRequest):
    try:
        return add_position(holding_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("加仓失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.get("/{holding_id:int}", response_model=HoldingItem)
async def api_get_holding(holding_id: int):
    try:
        from app.services.portfolio_service import get_holding_by_id
        return get_holding_by_id(holding_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("获取持仓详情失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.put("/{holding_id:int}", response_model=HoldingItem)
async def api_update_holding(holding_id: int, data: HoldingUpdate):
    try:
        return update_holding(holding_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("更新持仓失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/{holding_id:int}/sell", response_model=HoldingItem)
async def api_sell_holding(holding_id: int, sell_price: float = 0, reason: str = ""):
    try:
        price = sell_price if sell_price > 0 else None
        return sell_holding(holding_id, sell_price=price, reason=reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("卖出持仓失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/{holding_id:int}/sell-order", response_model=HoldingItem)
async def api_create_sell_order(holding_id: int, data: SellOrderRequest):
    try:
        return create_sell_order(holding_id, data.sell_price)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("创建卖出挂单失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.put("/{holding_id:int}/sell-order", response_model=HoldingItem)
async def api_update_sell_order(holding_id: int, data: SellOrderRequest):
    try:
        return update_sell_order_price(holding_id, data.sell_price)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("更新卖出挂单失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/{holding_id:int}/confirm-sell", response_model=HoldingItem)
async def api_confirm_sell(holding_id: int, reason: str = "挂单成交"):
    try:
        return confirm_sell(holding_id, reason=reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("确认卖出失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.post("/{holding_id:int}/cancel-sell", response_model=HoldingItem)
async def api_cancel_sell(holding_id: int):
    try:
        return cancel_sell_order(holding_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("取消卖出挂单失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


@router.delete("/{holding_id:int}")
async def api_delete_holding(holding_id: int):
    try:
        delete_holding(holding_id)
        return {"status": "ok", "message": f"持仓 {holding_id} 已撤销"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("撤销持仓失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")
