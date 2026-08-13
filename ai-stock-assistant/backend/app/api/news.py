from fastapi import APIRouter, HTTPException

from app.schemas.news import StockNewsBundle
from app.services.news_service import get_stock_news_bundle
from app.services.stock_service import STOCK_NAMES

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/{code}", response_model=StockNewsBundle)
async def get_stock_news(code: str, name: str = ""):
    try:
        stock_name = name or STOCK_NAMES.get(code, code)
        bundle = get_stock_news_bundle(code, stock_name)
        return bundle
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
