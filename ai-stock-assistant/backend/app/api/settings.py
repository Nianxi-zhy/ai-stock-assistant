from typing import Optional

from pydantic import BaseModel

from fastapi import APIRouter

import app.config as cfg

router = APIRouter(prefix="/settings", tags=["settings"])


class FilterSettingsResponse(BaseModel):
    low_price_mode: bool
    max_stock_price: float
    min_stock_price: float


class FilterSettingsUpdate(BaseModel):
    low_price_mode: Optional[bool] = None
    max_stock_price: Optional[float] = None
    min_stock_price: Optional[float] = None


@router.get("/filter", response_model=FilterSettingsResponse)
async def get_filter_settings():
    return FilterSettingsResponse(
        low_price_mode=cfg.LOW_PRICE_MODE,
        max_stock_price=cfg.MAX_STOCK_PRICE,
        min_stock_price=cfg.MIN_STOCK_PRICE,
    )


@router.put("/filter", response_model=FilterSettingsResponse)
async def update_filter_settings(body: FilterSettingsUpdate):
    if body.low_price_mode is not None:
        cfg.LOW_PRICE_MODE = body.low_price_mode
    if body.max_stock_price is not None:
        cfg.MAX_STOCK_PRICE = body.max_stock_price
    if body.min_stock_price is not None:
        cfg.MIN_STOCK_PRICE = body.min_stock_price
    return FilterSettingsResponse(
        low_price_mode=cfg.LOW_PRICE_MODE,
        max_stock_price=cfg.MAX_STOCK_PRICE,
        min_stock_price=cfg.MIN_STOCK_PRICE,
    )
