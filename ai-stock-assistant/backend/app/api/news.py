import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.schemas.news import StockNewsBundle
from app.services.news_service import get_stock_news_bundle
from app.services.stock_service import STOCK_NAMES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/{code}", response_model=StockNewsBundle)
async def get_stock_news(code: str, name: str = ""):
    try:
        stock_name = name or STOCK_NAMES.get(code, code)
        bundle = await asyncio.to_thread(get_stock_news_bundle, code, stock_name)
        return bundle
    except Exception:
        logger.exception("获取股票新闻失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")
