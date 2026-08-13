from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class NewsItem(BaseModel):
    source: str
    title: str
    content: str
    publish_time: str = ""
    url: str = ""


class StockNewsBundle(BaseModel):
    code: str
    name: str
    items: List[NewsItem] = Field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.items)
