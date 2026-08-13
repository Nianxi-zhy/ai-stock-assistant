# AI Stock Assistant

An AI-powered A-share stock research assistant. Pre-filters the whole A-share market with rules, then runs a multi-agent LLM pipeline to analyze candidates, manage holdings, and recommend daily picks — with token cost tracking end to end.

## Features

- **Two-tier Filtering** — Price filter (low-price mode by default, excludes ST/delisting) → rule-engine scoring (MACD/RSI/MA/volume, zero AI cost) → only top candidates reach the LLM
- **Multi-Agent Analysis** — News / Technical / Risk / Fundamental agents + a Decision agent that merges them into a score, action, target price and stop loss
- **Market Environment Detection** — Weighted score of SSE/SZSE/ChiNext indices → suitable / cautious / unsuitable
- **Portfolio Management** — Build positions, add positions, sell with auto P&L, pending sell orders, sold-stock watchlist, daily AI review of every holding
- **Backtesting** — 4 strategies (MACD cross, multi-indicator, Bollinger breakout, MA trend) with equity curves vs buy-and-hold
- **Cost Tracking** — Every LLM call logged (tokens + cache-hit + estimated RMB cost); total usage page in the dashboard
- **News & Fundamentals** — EastMoney + Sina news (with announcements), PE/PB/ROE fundamentals
- **Web Dashboard** — Next.js single-page app: recommendations, holdings, trades, backtest, token totals, sold watch

## Prerequisites

- Python 3.10+
- Node.js 18+
- An API key from [DeepSeek](https://platform.deepseek.com) or any OpenAI-compatible provider
- (Optional) [ServerChan](https://sct.ftqq.com) key for WeChat notifications

## Quick Start

### 1. Backend

```bash
cd ai-stock-assistant/backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY and other config
python run.py
```

The API will be available at `http://localhost:8000` (interactive docs at `/docs`).

On Windows, `backend/run_backend.ps1` starts uvicorn with proxy env vars cleared (AkShare needs no system proxy).

### 2. Frontend

```bash
cd ai-stock-assistant/frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

## Configuration (`ai-stock-assistant/backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Your LLM API key (DeepSeek/OpenAI) |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` | API base URL |
| `OPENAI_MODEL` | `deepseek-v4-flash` | Model name |
| `LOW_PRICE_MODE` | `true` | Enable low-price stock filtering |
| `MAX_STOCK_PRICE` | `30` | Max stock price in low-price mode (CNY) |
| `MIN_STOCK_PRICE` | `2.0` | Min stock price in low-price mode (CNY) |
| `RULE_W_*` | — | Per-rule weights for the rule engine (close>MA20, RSI, MACD, volume…) |
| `RECOMMENDATION_MAX_CANDIDATES` | `10` | Max stocks analyzed by AI per run (cost budget) |
| `RECOMMENDATION_MAX_PRESCREEN` | `80` | Pre-screen cap before rule scoring |
| `RECOMMENDATION_RUN_TIMEOUT_SECONDS` | `300` | Per-run timeout |
| `MARKET_SUITABLE_THRESHOLD` | `65` | Market environment score → suitable |
| `FUNDAMENTAL_ENABLED` | `true` | Enable fundamental analysis |
| `LLM_INPUT_PRICE_PER_1M` | `1.0` | Input price (CNY / 1M tokens) |
| `LLM_OUTPUT_PRICE_PER_1M` | `2.0` | Output price (CNY / 1M tokens) |
| `SERVER_CHAN_KEY` | — | ServerChan push key for WeChat |
| `API_HOST` | `0.0.0.0` | Backend bind address |
| `API_PORT` | `8000` | Backend port |

Full reference in `ai-stock-assistant/backend/.env.example`.

## Project Structure

```
ai-stock-assistant/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── api/                # REST endpoints (/api/v1)
│   │   ├── agents/             # Multi-agent pipeline (news/technical/risk/fundamental/decision)
│   │   ├── services/           # Data, indicators, rules, recommendations, portfolio, backtest…
│   │   ├── prompts/            # Prompt templates
│   │   └── schemas/            # Pydantic models
│   ├── data/                   # SQLite database (runtime)
│   ├── run.py                  # uvicorn launcher (reload=True)
│   ├── run_daily.py            # Daily routine CLI
│   ├── requirements.txt
│   └── .env.example
├── frontend/                   # Next.js 16 single-page dashboard
│   ├── app/                    # Pages & layout
│   ├── components/             # UI components
│   └── lib/api.ts              # Backend API client
├── PROJECT_GUIDE.md            # Development guide (architecture, APIs, DB, config)
└── README.md
```

## Tech Stack

- **Backend**: FastAPI, Tencent/AkShare dual-source kline, pandas, ta, OpenAI SDK, SQLite
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, lightweight-charts, Recharts
- **Notifications**: ServerChan (WeChat)

## Documentation

- [PROJECT_GUIDE.md](ai-stock-assistant/PROJECT_GUIDE.md) — full architecture, API list, DB schema, and config reference (Chinese)
- [README.zh-CN.md](README.zh-CN.md) — 中文版

## License

MIT
