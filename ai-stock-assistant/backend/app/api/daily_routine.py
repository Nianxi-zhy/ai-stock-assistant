from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import DailyRoutineResponse
from app.services.daily_service import run_daily_routine

router = APIRouter(prefix="/daily-routine", tags=["daily-routine"])


@router.post("", response_model=DailyRoutineResponse)
async def api_run_daily_routine():
    try:
        return run_daily_routine()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
