from contextlib import asynccontextmanager

import app.config  # noqa: F401
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import analysis, backtest, candidates, daily_routine, market, news, paper, portfolio, recommendations, scheduler, settings, stocks, trades, usage
from app.services.scheduler_service import maybe_run_daily_backtest


class LazySchedulerMiddleware(BaseHTTPMiddleware):
    """懒触发：每天 15:10 后任意请求进来时，检查并后台执行每日自动回测（每个自然日一次）。"""

    async def dispatch(self, request, call_next):
        maybe_run_daily_backtest()
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


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
app.include_router(market.router, prefix=API_PREFIX)
app.include_router(stocks.router, prefix=API_PREFIX)
app.include_router(analysis.router, prefix=API_PREFIX)
app.include_router(candidates.router, prefix=API_PREFIX)
app.include_router(recommendations.router, prefix=API_PREFIX)
app.include_router(news.router, prefix=API_PREFIX)
app.include_router(settings.router, prefix=API_PREFIX)
app.include_router(portfolio.router, prefix=API_PREFIX)
app.include_router(trades.router, prefix=API_PREFIX)
app.include_router(daily_routine.router, prefix=API_PREFIX)
app.include_router(scheduler.router, prefix=API_PREFIX)
app.include_router(backtest.router, prefix=API_PREFIX)
app.include_router(usage.router, prefix=API_PREFIX)
app.include_router(paper.router, prefix=API_PREFIX)


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
