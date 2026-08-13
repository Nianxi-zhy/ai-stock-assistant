import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import DailyRoutineResponse
from app.services.daily_service import run_daily_routine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/daily-routine", tags=["daily-routine"])


@router.post("", response_model=DailyRoutineResponse)
async def api_run_daily_routine():
    try:
        return await asyncio.to_thread(run_daily_routine)
    except Exception:
        logger.exception("每日例行任务执行失败")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")
