import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.services.market_service import assess_market_environment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/environment")
async def api_market_environment():
    try:
        return await asyncio.to_thread(assess_market_environment)
    except Exception:
        logger.exception("市场环境评估失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")
