import asyncio

from fastapi import APIRouter

from app.services import paper_trade_service

router = APIRouter(prefix="/paper", tags=["paper"])


@router.get("/track")
async def get_paper_track():
    return paper_trade_service.list_tracked()


@router.post("/track/sync")
async def sync_paper_track():
    """同步推荐→跟踪表，刷新最新价并结算到期观察。"""
    return await asyncio.to_thread(paper_trade_service.update_and_settle)
