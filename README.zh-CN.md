# AI Stock Assistant（A 股 AI 投研助手）

每日自动筛选、分析、推荐股票的 AI 投研工具。先用规则引擎对全 A 股预筛选，再用多 Agent LLM 管线深度分析候选股，管理持仓并输出每日推荐，全程追踪 Token 成本。

## 功能

- **两级筛选** — 价格过滤（低价股模式，排除 ST/退市）→ 规则引擎打分（MACD/RSI/MA/成交量，零 AI 成本）→ 仅 Top 候选进入 LLM
- **多 Agent 分析** — News / Technical / Risk / Fundamental 四 Agent 独立分析 + Decision Agent 综合决策（评分、动作、目标价、止损价）
- **大盘环境检测** — 上证/深成/创业板加权评分 → 适合 / 谨慎 / 不适合
- **持仓管理** — 建仓 / 加仓 / 平仓自动盈亏 / 挂单卖出 / 撤销挂单 / 已卖观察 / 持仓每日 AI 回顾
- **策略回测** — 4 种策略（MACD 金叉 / 多指标共振 / 布林突破 / 均线趋势），资金曲线对比买入持有
- **成本追踪** — 每次 LLM 调用落库（token + 缓存命中 + 估算人民币费用），前端累计总览页
- **新闻与基本面** — 东方财富 + 新浪新闻（含公告）、PE/PB/ROE 基本面
- **网页仪表盘** — Next.js 单页应用：推荐 / 持仓 / 交易 / 回测 / Token 统计 / 已卖观察

## 环境要求

- Python 3.10+
- Node.js 18+
- 一个 [DeepSeek](https://platform.deepseek.com) 或其他 OpenAI 兼容的 API 密钥
- （可选）[ServerChan](https://sct.ftqq.com) 密钥用于微信推送

## 快速开始

### 1. 启动后端

```bash
cd ai-stock-assistant/backend
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 等配置
python run.py
```

API 地址：`http://localhost:8000`（交互文档 `/docs`）。

Windows 下可用 `backend/run_backend.ps1` 一键启动（自动清除代理环境变量，AkShare 不需要系统代理）。

### 2. 启动前端

```bash
cd ai-stock-assistant/frontend
npm install
npm run dev
```

仪表盘地址：`http://localhost:3000`

## 配置说明 (`ai-stock-assistant/backend/.env`)

| 变量 | 默认值 | 说明 |
|---|---|---|
| `OPENAI_API_KEY` | — | LLM API 密钥（DeepSeek/OpenAI） |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` | API 地址 |
| `OPENAI_MODEL` | `deepseek-v4-flash` | 模型名称 |
| `LOW_PRICE_MODE` | `true` | 启用低价股筛选模式 |
| `MAX_STOCK_PRICE` | `30` | 低价股最高价（元） |
| `MIN_STOCK_PRICE` | `2.0` | 低价股最低价（元） |
| `RULE_W_*` | — | 规则引擎各规则权重（价在 MA20 上、RSI、MACD、成交量等） |
| `RECOMMENDATION_MAX_CANDIDATES` | `10` | 单次任务最多 AI 分析股数（成本预算） |
| `RECOMMENDATION_MAX_PRESCREEN` | `80` | 规则打分前预筛上限 |
| `RECOMMENDATION_RUN_TIMEOUT_SECONDS` | `300` | 单次任务超时 |
| `MARKET_SUITABLE_THRESHOLD` | `65` | 大盘环境评分 → 适合投资 |
| `FUNDAMENTAL_ENABLED` | `true` | 基本面分析开关 |
| `LLM_INPUT_PRICE_PER_1M` | `1.0` | 输入单价（元 / 百万 token） |
| `LLM_OUTPUT_PRICE_PER_1M` | `2.0` | 输出单价（元 / 百万 token） |
| `SERVER_CHAN_KEY` | — | ServerChan 推送密钥 |
| `API_HOST` | `0.0.0.0` | 后端监听地址 |
| `API_PORT` | `8000` | 后端端口 |

完整参考见 `ai-stock-assistant/backend/.env.example`。

## 项目结构

```
ai-stock-assistant/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── api/                # REST 接口（/api/v1）
│   │   ├── agents/             # 多 Agent 管线（新闻/技术/风险/基本面/决策）
│   │   ├── services/           # 数据、指标、规则、推荐、持仓、回测等
│   │   ├── prompts/            # Prompt 模板
│   │   └── schemas/            # Pydantic 模型
│   ├── data/                   # SQLite 数据库（运行时生成）
│   ├── run.py                  # uvicorn 启动（reload=True）
│   ├── run_daily.py            # 每日流程 CLI 入口
│   ├── requirements.txt
│   └── .env.example
├── frontend/                   # Next.js 16 单页仪表盘
│   ├── app/                    # 页面和布局
│   ├── components/             # UI 组件
│   └── lib/api.ts              # 后端 API 封装
├── PROJECT_GUIDE.md            # 开发指导文档（架构、API、数据库、配置）
└── README.md
```

## 技术栈

- **后端**：FastAPI、腾讯/AkShare 双源 K 线、pandas、ta、OpenAI SDK、SQLite
- **前端**：Next.js 16、React 19、Tailwind CSS 4、lightweight-charts、Recharts
- **通知**：ServerChan（微信）

## 文档

- [PROJECT_GUIDE.md](ai-stock-assistant/PROJECT_GUIDE.md) — 完整架构、API 列表、数据库设计、配置参考
- [README.md](README.md) — English version

## 许可证

MIT
