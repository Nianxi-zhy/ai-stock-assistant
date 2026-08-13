"""持仓/交易/回顾的 Pydantic 模型"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class HoldingCreate(BaseModel):
    code: str
    name: str
    buy_price: float
    quantity: int
    stop_loss: float = 0.0
    take_profit: float = 0.0
    ai_score_at_buy: int = 0
    buy_reason: str = ""
    buy_date: Optional[str] = None


class HoldingUpdate(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    buy_price: Optional[float] = None


class AddPositionRequest(BaseModel):
    add_price: float
    add_quantity: int
    add_reason: str = "手动加仓"


class SellOrderRequest(BaseModel):
    sell_price: float


class HoldingItem(BaseModel):
    id: int
    code: str
    name: str
    buy_date: str
    buy_price: float
    quantity: int
    current_price: float
    stop_loss: float
    take_profit: float
    ai_score_at_buy: int
    buy_reason: str
    status: str
    sell_price: float = 0.0
    pnl_pct: Optional[float] = None
    pnl_amount: Optional[float] = None
    market_value: Optional[float] = None
    days_held: Optional[int] = None
    created_at: str
    updated_at: str


class HoldingListResponse(BaseModel):
    count: int
    total_market_value: float
    total_cost: float
    total_pnl: float
    total_pnl_pct: float
    items: List[HoldingItem]


class TradeRecord(BaseModel):
    id: int
    holding_id: Optional[int] = None
    code: str
    name: str
    trade_date: str
    trade_type: str
    price: float
    quantity: int
    reason: str
    pnl: float
    pnl_pct: float
    created_at: str


class TradeListResponse(BaseModel):
    count: int
    items: List[TradeRecord]


class TradeStats(BaseModel):
    total_trades: int = 0
    win_count: int = 0
    loss_count: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    avg_return: float = 0.0
    max_return: float = 0.0
    min_return: float = 0.0
    max_drawdown: float = 0.0
    avg_holding_days: float = 0.0


class MonthlyPnL(BaseModel):
    month: str
    trade_count: int
    total_pnl: float
    win_count: int


class DailyReviewResult(BaseModel):
    holding_id: int
    code: str
    name: str
    action: str
    score: int
    stars: int
    reason: str
    current_price: float
    pnl_pct: float
    suggested_sell_price: Optional[float] = None


class HoldingAdvice(BaseModel):
    holding_id: int
    code: str
    name: str
    action: str  # 继续持有 / 注意风险 / 建议止损 / 考虑止盈 / 建议评估
    severity: str  # default / warning / danger / success / info
    reason: str
    days_held: int
    pnl_pct: float
    pnl_amount: float = 0.0
    market_value: float = 0.0
    buy_price: float = 0.0
    current_price: float = 0.0
    llm_analyzed: bool = False
    suggested_sell_price: Optional[float] = None


class HoldingsAdviceResponse(BaseModel):
    items: List[HoldingAdvice]


class DailyRoutineResponse(BaseModel):
    date: str
    holdings_reviewed: int
    new_candidates: int
    new_recommendations: int
    total_token_usage: dict
    reviews: List[DailyReviewResult] = []
