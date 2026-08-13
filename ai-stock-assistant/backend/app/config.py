"""应用配置 — 使用 Pydantic Settings 统一管理，自动从 .env 加载。"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# 避免 Windows 系统代理导致 AkShare 请求失败
os.environ.setdefault("NO_PROXY", "*")
for _proxy_key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(_proxy_key, None)

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── LLM ──────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o"

    # LLM 计费（人民币 / 每百万 token）
    LLM_INPUT_PRICE_PER_1M: float = 1.0
    LLM_INPUT_CACHE_HIT_PRICE_PER_1M: float = 0.02
    LLM_OUTPUT_PRICE_PER_1M: float = 2.0

    # ── 低价股筛选 ───────────────────────────────────────
    LOW_PRICE_MODE: bool = True
    MAX_STOCK_PRICE: float = 30.0
    MIN_STOCK_PRICE: float = 2.0

    # ── 规则权重 ─────────────────────────────────────────
    RULE_W_CLOSE_MA20: int = 20
    RULE_W_MA20_MA60: int = 10
    RULE_W_RSI: int = 15
    RULE_W_MACD: int = 15
    RULE_W_VOLUME: int = 5

    # ── 大盘环境检测 ─────────────────────────────────────
    MARKET_INDEX_CODE: str = "000001"
    MARKET_MA_DAYS: int = 60
    MARKET_BEARISH_THRESHOLD: float = -5.0
    MARKET_SUITABLE_THRESHOLD: int = 65
    MARKET_CAUTIOUS_THRESHOLD: int = 40

    # ── 全量扫描 ─────────────────────────────────────────
    FULL_SCAN_MAX_WORKERS: int = 12
    FULL_SCAN_MIN_CANDIDATES: int = 200

    # ── 推荐任务预算 ─────────────────────────────────────
    RECOMMENDATION_MAX_CANDIDATES: int = 10
    RECOMMENDATION_MAX_PRESCREEN: int = 80
    RECOMMENDATION_MAX_WORKERS: int = 3
    RECOMMENDATION_RUN_TIMEOUT_SECONDS: int = 300

    # ── 基本面 ───────────────────────────────────────────
    FUNDAMENTAL_ENABLED: bool = True

    # ── 新闻抓取 ─────────────────────────────────────────
    NEWS_EM_LIMIT: int = 5
    NEWS_NOTICE_LIMIT: int = 3
    NEWS_NOTICE_DAYS: int = 30
    NEWS_MAX_DAYS: int = 7
    NEWS_FETCH_EM: bool = True
    NEWS_FETCH_SINA: bool = True
    NEWS_SUMMARY_MAX_CHARS: int = 1200

    # ── FastAPI / uvicorn ────────────────────────────────
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # ── API 鉴权（可选）──────────────────────────────────
    # 设置后写操作/烧钱接口需携带 X-API-Key 请求头；留空则鉴权关闭（默认，向后兼容）
    API_KEY: str = ""

    # ── 通知 ─────────────────────────────────────────────
    SERVER_CHAN_KEY: str = ""

    # ── 数据源 URL ───────────────────────────────────────
    tencent_kline_url: str = "https://ifzq.gtimg.cn/appstock/app/fqkline/get"
    tencent_quote_url: str = "https://web.sqt.gtimg.cn/q="
    sina_quote_url: str = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
    sina_news_url: str = "https://feed.mix.sina.com.cn/api/roll/get"
    serverchan_url: str = "https://sctapi.ftqq.com"

    # ── 派生属性 ─────────────────────────────────────────
    @computed_field
    @property
    def RULE_WEIGHTS(self) -> Dict[str, int]:
        return {
            "close above MA20": self.RULE_W_CLOSE_MA20,
            "MA20 above or near MA60": self.RULE_W_MA20_MA60,
            "RSI in healthy range": self.RULE_W_RSI,
            "MACD improving": self.RULE_W_MACD,
            "volume above 20-day average": self.RULE_W_VOLUME,
        }

    @computed_field
    @property
    def MARKET_INDICES(self) -> Dict[str, Dict[str, Any]]:
        return {
            "000001": {"name": "上证指数", "weight": 0.5},
            "399001": {"name": "深证成指", "weight": 0.3},
            "399006": {"name": "创业板指", "weight": 0.2},
        }


_settings = Settings()

# ── 模块级导出（保持与旧接口完全兼容） ──────────────────
OPENAI_API_KEY = _settings.OPENAI_API_KEY
OPENAI_BASE_URL = _settings.OPENAI_BASE_URL
OPENAI_MODEL = _settings.OPENAI_MODEL

LLM_INPUT_PRICE_PER_1M = _settings.LLM_INPUT_PRICE_PER_1M
LLM_INPUT_CACHE_HIT_PRICE_PER_1M = _settings.LLM_INPUT_CACHE_HIT_PRICE_PER_1M
LLM_OUTPUT_PRICE_PER_1M = _settings.LLM_OUTPUT_PRICE_PER_1M

LOW_PRICE_MODE = _settings.LOW_PRICE_MODE
MAX_STOCK_PRICE = _settings.MAX_STOCK_PRICE
MIN_STOCK_PRICE = _settings.MIN_STOCK_PRICE

RULE_WEIGHTS = _settings.RULE_WEIGHTS

MARKET_INDEX_CODE = _settings.MARKET_INDEX_CODE
MARKET_MA_DAYS = _settings.MARKET_MA_DAYS
MARKET_BEARISH_THRESHOLD = _settings.MARKET_BEARISH_THRESHOLD
MARKET_SUITABLE_THRESHOLD = _settings.MARKET_SUITABLE_THRESHOLD
MARKET_CAUTIOUS_THRESHOLD = _settings.MARKET_CAUTIOUS_THRESHOLD
MARKET_INDICES = _settings.MARKET_INDICES

FULL_SCAN_MAX_WORKERS = _settings.FULL_SCAN_MAX_WORKERS
FULL_SCAN_MIN_CANDIDATES = _settings.FULL_SCAN_MIN_CANDIDATES

RECOMMENDATION_MAX_CANDIDATES = _settings.RECOMMENDATION_MAX_CANDIDATES
RECOMMENDATION_MAX_PRESCREEN = _settings.RECOMMENDATION_MAX_PRESCREEN
RECOMMENDATION_MAX_WORKERS = _settings.RECOMMENDATION_MAX_WORKERS
RECOMMENDATION_RUN_TIMEOUT_SECONDS = _settings.RECOMMENDATION_RUN_TIMEOUT_SECONDS

FUNDAMENTAL_ENABLED = _settings.FUNDAMENTAL_ENABLED

NEWS_EM_LIMIT = _settings.NEWS_EM_LIMIT
NEWS_NOTICE_LIMIT = _settings.NEWS_NOTICE_LIMIT
NEWS_NOTICE_DAYS = _settings.NEWS_NOTICE_DAYS
NEWS_MAX_DAYS = _settings.NEWS_MAX_DAYS
NEWS_FETCH_EM = _settings.NEWS_FETCH_EM
NEWS_FETCH_SINA = _settings.NEWS_FETCH_SINA
NEWS_SUMMARY_MAX_CHARS = _settings.NEWS_SUMMARY_MAX_CHARS

API_HOST = _settings.API_HOST
API_PORT = _settings.API_PORT
API_KEY = _settings.API_KEY

SERVER_CHAN_KEY = _settings.SERVER_CHAN_KEY

# ── 数据源 URL 导出 ─────────────────────────────────────
TENCENT_KLINE_URL = _settings.tencent_kline_url
TENCENT_QUOTE_URL = _settings.tencent_quote_url
SINA_QUOTE_URL = _settings.sina_quote_url
SINA_NEWS_URL = _settings.sina_news_url
SERVERCHAN_URL = _settings.serverchan_url


def get_settings() -> Settings:
    """返回 Settings 实例，供需要动态配置的场景使用。"""
    return _settings
