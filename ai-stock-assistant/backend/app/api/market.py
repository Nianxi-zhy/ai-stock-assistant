from fastapi import APIRouter, HTTPException

from app.services.market_service import assess_market_environment

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/environment")
async def api_market_environment():
    try:
        return assess_market_environment()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
