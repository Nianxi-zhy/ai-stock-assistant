"""Agent 共享类型与工具"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.usage import TokenUsage


class AgentResult(BaseModel):
    agent_name: str
    stars: int = 3
    signal: str = "中性"
    summary: str = ""
    details: str = ""
    token_usage: Optional[TokenUsage] = None
    status: Literal["ok", "unavailable", "failed"] = "ok"
    error: Optional[str] = None
