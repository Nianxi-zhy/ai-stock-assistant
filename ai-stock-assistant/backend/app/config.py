import os
from pathlib import Path

from dotenv import load_dotenv

# 避免 Windows 系统代理导致 AkShare 请求失败
os.environ.setdefault("NO_PROXY", "*")
for _proxy_key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(_proxy_key, None)

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# LLM 计费（人民币 / 每百万 token），可在 .env 中按实际服务商调整
LLM_INPUT_PRICE_PER_1M = float(os.getenv("LLM_INPUT_PRICE_PER_1M", "1.0"))
LLM_INPUT_CACHE_HIT_PRICE_PER_1M = float(os.getenv("LLM_INPUT_CACHE_HIT_PRICE_PER_1M", "0.02"))
LLM_OUTPUT_PRICE_PER_1M = float(os.getenv("LLM_OUTPUT_PRICE_PER_1M", "2.0"))

# 低价股筛选：小本金入门默认开启，后期可在 .env 或前端切换
LOW_PRICE_MODE = os.getenv("LOW_PRICE_MODE", "true").lower() in {"1", "true", "yes", "on"}
MAX_STOCK_PRICE = float(os.getenv("MAX_STOCK_PRICE", "30"))
MIN_STOCK_PRICE = float(os.getenv("MIN_STOCK_PRICE", "2.0"))
# 规则权重配置（可在 .env 中按规则名覆盖）
RULE_WEIGHTS = {
    "close above MA20": int(os.getenv("RULE_W_CLOSE_MA20", "20")),
    "MA20 above or near MA60": int(os.getenv("RULE_W_MA20_MA60", "10")),
    "RSI in healthy range": int(os.getenv("RULE_W_RSI", "15")),
    "MACD improving": int(os.getenv("RULE_W_MACD", "15")),
    "volume above 20-day average": int(os.getenv("RULE_W_VOLUME", "5")),
}

# 大盘环境检测参数
MARKET_INDEX_CODE = os.getenv("MARKET_INDEX_CODE", "000001")
MARKET_MA_DAYS = int(os.getenv("MARKET_MA_DAYS", "60"))
MARKET_BEARISH_THRESHOLD = float(os.getenv("MARKET_BEARISH_THRESHOLD", "-5.0"))

# 大盘环境综合评分参数（market_service.py）
MARKET_SUITABLE_THRESHOLD = int(os.getenv("MARKET_SUITABLE_THRESHOLD", "65"))
MARKET_CAUTIOUS_THRESHOLD = int(os.getenv("MARKET_CAUTIOUS_THRESHOLD", "40"))
MARKET_INDICES = {
    "000001": {"name": "上证指数", "weight": 0.5},
    "399001": {"name": "深证成指", "weight": 0.3},
    "399006": {"name": "创业板指", "weight": 0.2},
}

# 全量扫描参数
FULL_SCAN_MAX_WORKERS = int(os.getenv("FULL_SCAN_MAX_WORKERS", "12"))
FULL_SCAN_MIN_CANDIDATES = int(os.getenv("FULL_SCAN_MIN_CANDIDATES", "200"))

# 推荐任务预算：避免一次刷新占满 API 进程或产生失控的模型调用成本。
RECOMMENDATION_MAX_CANDIDATES = int(os.getenv("RECOMMENDATION_MAX_CANDIDATES", "10"))
RECOMMENDATION_MAX_PRESCREEN = int(os.getenv("RECOMMENDATION_MAX_PRESCREEN", "80"))
RECOMMENDATION_MAX_WORKERS = int(os.getenv("RECOMMENDATION_MAX_WORKERS", "3"))
RECOMMENDATION_RUN_TIMEOUT_SECONDS = int(os.getenv("RECOMMENDATION_RUN_TIMEOUT_SECONDS", "300"))

# 基本面参数
FUNDAMENTAL_ENABLED = os.getenv("FUNDAMENTAL_ENABLED", "true").lower() in {"1", "true", "yes", "on"}


# 新闻抓取（Day 3）
NEWS_EM_LIMIT = int(os.getenv("NEWS_EM_LIMIT", "5"))
NEWS_NOTICE_LIMIT = int(os.getenv("NEWS_NOTICE_LIMIT", "3"))
NEWS_NOTICE_DAYS = int(os.getenv("NEWS_NOTICE_DAYS", "30"))
NEWS_MAX_DAYS = int(os.getenv("NEWS_MAX_DAYS", "7"))
NEWS_FETCH_EM = os.getenv("NEWS_FETCH_EM", "true").lower() in {"1", "true", "yes", "on"}
NEWS_FETCH_SINA = os.getenv("NEWS_FETCH_SINA", "true").lower() in {"1", "true", "yes", "on"}
NEWS_SUMMARY_MAX_CHARS = int(os.getenv("NEWS_SUMMARY_MAX_CHARS", "1200"))

# FastAPI / uvicorn
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# 通知（Day 8）
SERVER_CHAN_KEY = os.getenv("SERVER_CHAN_KEY", "")
