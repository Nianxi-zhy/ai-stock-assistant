import asyncio
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from contextlib import asynccontextmanager

import app.config  # noqa: F401
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import analysis, backtest, candidates, daily_routine, market, news, paper, portfolio, recommendations, scheduler, settings, stocks, trades, usage
from app.db import close_all_connections, init_db
from app.deps import verify_api_key
from app.services.scheduler_service import maybe_run_daily_backtest

logger = logging.getLogger(__name__)


class LazySchedulerMiddleware(BaseHTTPMiddleware):
    """懒触发：每天 15:10 后任意请求进来时，检查并后台执行每日自动回测（每个自然日一次）。"""

    async def dispatch(self, request, call_next):
        await asyncio.to_thread(maybe_run_daily_backtest)
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        yield
    finally:
        close_all_connections()


app = FastAPI(
    title="AI Stock Assistant",
    description="A 股 AI 投研助手 API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LazySchedulerMiddleware)

API_PREFIX = "/api/v1"
# 纯读行情/新闻的 router 保持开放
app.include_router(market.router, prefix=API_PREFIX)
app.include_router(stocks.router, prefix=API_PREFIX)
app.include_router(analysis.router, prefix=API_PREFIX)
app.include_router(candidates.router, prefix=API_PREFIX)
app.include_router(news.router, prefix=API_PREFIX)
app.include_router(usage.router, prefix=API_PREFIX)
# 含写操作或烧钱操作的 router 挂载可选 API Key 鉴权
auth = [Depends(verify_api_key)]
app.include_router(recommendations.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(settings.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(portfolio.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(trades.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(daily_routine.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(scheduler.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(backtest.router, prefix=API_PREFIX, dependencies=auth)
app.include_router(paper.router, prefix=API_PREFIX, dependencies=auth)


@app.get("/")
async def root():
    return {
        "name": "AI Stock Assistant",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器 — 捕获未处理异常，返回统一格式，避免堆栈泄露。"""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误，请稍后重试"},
    )
