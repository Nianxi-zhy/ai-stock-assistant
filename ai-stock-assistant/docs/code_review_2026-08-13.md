# AI Stock Assistant 代码质量评审报告

评审日期：2026-08-13
评审范围：`backend/`（Python/FastAPI，57 个源文件）、`frontend/`（Next.js/TypeScript，37 个源文件）、测试与工程化基建
评审方式：全部源文件逐文件阅读 + 关键问题人工复核确认

## 总体评价

项目整体结构清晰（api / services / agents / schemas 分层合理）、git 卫生良好（无密钥/DB 入库，requirements 精确锁版本），但存在若干**正确性级别的缺陷**：事件循环阻塞、配置系统失效、启动初始化缺失。工程化处于早期：零自动化测试、零 CI。

严重度分布：高 11 / 中 20 / 低 12。

---

## 一、后端

### 1. 正确性与并发（高优先级）

**【高】async handler 内同步阻塞调用，卡死事件循环**
`app/api/backtest.py:45-80`（`/scan`、`/research`）、`portfolio.py`、`scheduler.py`、`market.py`、`news.py`、`paper.py` 中的 handler 都是 `async def`，却直接调用 CPU 密集/分钟级的 `scan_strategy`、`walk_forward`、LLM 分析。一个回测请求会阻塞所有其他请求。仅 `recommendations.py:148` 正确使用了 `asyncio.to_thread`。
→ 改进：重负载 handler 统一 `await asyncio.to_thread(scan_strategy, ...)`，或直接把 handler 改为同步 `def`（FastAPI 会自动放线程池执行）。

**【高】配置系统不一致：settings 修改对部分模块永远不生效**
`app/api/settings.py:34-40` 运行时改写 `cfg.LOW_PRICE_MODE` 等模块级变量，但 `news_service.py:13-22`、`agents/llm.py:13` 使用 `from app.config import X` 按值导入——PUT 成功后这些模块仍读旧值；且重启后全部丢失、非线程安全。
→ 改进：所有模块统一 `import app.config as cfg` + 运行时读 `cfg.X`；或将设置持久化到 DB/文件，提供 reload 钩子。

**【高】lifespan 为空，fresh 部署首请求即 500**
`app/main.py:32-34`：`init_db()` 从未在启动时调用（依赖 `portfolio_service.ensure_tables` 间接建表，先被访问的其他端点会因表不存在报错）；`close_all_connections()` 也从未在 shutdown 调用。
→ 改进：`lifespan` 中启动时 `init_db()`、关闭时 `close_all_connections()`。

**【高】共享缓存 DataFrame 被原地修改**
`app/services/market_service.py:145`：`kline.iloc[-1, ...] = realtime_price` 直接污染 `stock_service.py:27` 的 `_kline_cache` 中的共享对象，并发读会拿到被篡改的收盘价。
→ 改进：修改前 `kline.copy()`，或缓存不可变数据。

**【中】连接池脏事务复用**
`app/db.py:46-48`：`_PooledConnection.close()` 是 no-op，上层异常未 commit 时，未提交事务随连接被下一线程复用。
→ 改进：归还连接前执行 `conn.rollback()`。

**【中】每日任务崩溃后永不重试**
`scheduler_service.py:402-417`：`_claim_job` 抢到锁后若进程崩溃，`daily_job_log` 永久停留 `running` 状态，当日任务不再执行。
→ 改进：启动时将超时的 `running` 记录重置为 `failed` 并允许重试。

### 2. 错误处理

**【高】500 响应泄露内部错误细节（15 处）**
`app/api/analysis.py:91-92`、`backtest.py:41-42/61-62/82-83/105-106` 等所有路由文件：`except Exception as e: raise HTTPException(500, detail=str(e))` 把内部异常原文（可能含路径、SQL、API 细节）直接返回客户端，且与 `main.py:84` 全局处理器的"防泄露"意图自相矛盾。
→ 改进：统一改 `logger.exception(...)` + 固定文案 `detail="服务器内部错误"`；客户端可预期错误（如参数错）用 4xx。

**【中】静默吞异常**
- `backtest_service.py:327-328`：`_save_backtest_run` 失败 `except Exception: pass`，连日志都没有——回测结果落库失败完全无声。
- `portfolio_service.py:559-560`：LLM 分析失败静默降级为规则建议，用户不知道 LLM 没跑。
- `stock_service.py:86-87/124-125`：`except Exception: return None`，网络错误与解析错误不分。
→ 改进：至少 `logger.warning` 记录原因；LLM 降级应在响应中标注 `degraded: true`。

**【中】潜在 NameError**
`daily_service.py:124-146`：`conn = get_connection()` 在 try 内，若其抛错，finally 中 `conn.close()` 触发 NameError。
→ 改进：`conn = None` 预置，finally 中判空。

### 3. 安全

**【高】全部写端点无鉴权**
14 个 router 无任何 Depends/API key，却包含：`PUT /settings/filter`（改全局配置）、`DELETE /portfolio/{id}`（删数据）、`POST /scheduler/daily-run` 和 `POST /recommendations/today`（触发消耗 LLM 额度的烧钱任务）。`config.py:78` 绑定 `0.0.0.0` 时局域网任何人可调用。
→ 改进：加共享密钥校验（`Depends(verify_api_key)` 比对 `X-API-Key` header），至少保护烧钱和写接口。

**【中】CORS 配置偏宽**
`main.py:44-50`：`allow_methods=["*"]`、`allow_headers=["*"]` + `allow_credentials=True`。origins 虽限 localhost，仍建议收敛 methods/headers 到实际用到的集合。

**【中】SQL 字符串拼接模式**
`portfolio_service.py:141`：`f"UPDATE holdings SET {', '.join(fields)} ..."`。当前 fields 来自常量分支暂无注入，但该模式易被后续扩展引入注入。
→ 改进：改用白名单映射 `{field_name: column}` 校验后再拼接。

（正面：未发现硬编码密钥，OPENAI_API_KEY 走 .env；无 eval/exec；大部分 SQL 用参数化查询。）

### 4. 性能

**【高】热路径 N+1 DB 查询**
`calibrate_service.py:84-87`：`_rule_hits` 每只股票调 `_param` 4 次 = 4 次 DB 连接+查询；`rule_engine.py:60-66` 同样每股 4 次 `_param` + 1 次 `load_rule_weights`。一次 ~300 股扫描 ≈ 1500 次冗余查询。
→ 改进：循环外一次性加载全部 `rule_params` 为 dict，传入评估函数。

**【高】全市场扫描单线程翻页**
`filter_service.py:24-74`：`_fetch_spot_from_sina` 顺序翻页拉 ~5000 只股票（每页 sleep 0.1s），缓存仅 120s。
→ 改进：线程池并发翻页 + 延长缓存 TTL（盘中 5min，盘后 24h）。

**【中】循环内逐个同步 HTTP**
`portfolio_service.py:302-325`（`refresh_all_prices`）、`263-287`、`paper_trade_service.py:135-136`：N+1 HTTP，无并发。
→ 改进：`concurrent.futures.ThreadPoolExecutor` 批量拉取（注意限流）。

**【中】全表拉取后 Python 聚合**
`api/usage.py:38-41`：`SELECT ... FROM token_log` 无 LIMIT，58-101 行在 Python 里聚合，随时间必然变慢。
→ 改进：改 SQL `GROUP BY date(...)` 聚合。

**【中】其他**：`backtest_service.py:140`、`stocks.py:102` 用 `df.iterrows()`（应向量化/`itertuples`）；`indicator_service.py:194-209` `detect_market_phase` 无缓存，批量筛选时每股重算一次大盘指标；`services/cache.py` TTLCache 无容量上限。

### 5. 结构与可读性

- **【中】重复代码**：`backtest_service._simulate_trades` 与 `backtest_research_service._simulate` 几乎逐行重复；`daily_service.py:124-146` 手写 DELETE+INSERT 与 `recommend_service.persist_recommendation_report` 功能重复且更弱（DELETE 会误删同日其他 run 的数据）；5 个 agent 文件的 SYSTEM_PROMPT + try/except fallback 结构高度重复（应抽公共基类）。
- **【中】超长/多职责函数**：`portfolio_service.get_holdings_advice`（458-622，约 165 行）混合价格刷新、DB、LLM、规则引擎、响应组装，且 563 行在 for 循环体内重复定义嵌套函数。
- **【中】魔法数字**：止损止盈阈值 -15/-5/25/15（`portfolio_service.py:573-583`）、`cash * 0.95`（`backtest_service.py:146`）、腾讯接口数组索引 `parts[39]/[46]/[45]`（`fundamental_service.py:64-66`）应抽为命名常量/配置。
- **【低】职责混乱**：`recommend_service.py:423-481` service 文件里带 argparse `main()` CLI；`news_service.py:193` 空函数 `clear_news_cache()` 被调用（注释与实现不符）。

---

## 二、前端

### 1. 正确性（高优先级）

**【高】资金操作静默失败**
`app/page.tsx:44-46, 57-59`：买入/撤销失败 `catch { // ignore }`，用户点击"买入"失败毫无反馈。
→ 改进：接 toast/alert 错误提示。

**【高】API 缓存无失效机制（正确性兼性能 bug）**
`lib/api.ts:139-142`：`fetchFilterSettings` 走 30s `__apiCache`；`updateFilterSettings` PUT 成功后立即重新拉取会命中旧缓存，UI 显示修改前的值。
→ 改进：写操作成功后删除对应缓存 key（实现 `invalidate(key)`）。

**【高】加载失败与"无数据"不可区分**
`HomePageContent.tsx:75, 92`：推荐与筛选设置加载 `.catch(() => {})` 吞异常，失败时页面永远停在"暂无推荐"。
→ 改进：补 error state + 重试按钮。

**【高】反向数据流反模式**
`HomePageContent.tsx:119-129` 通过 `onHeaderReady` 把 `{onRefresh, onAnalyze...}` 塞进父组件 state（`app/page.tsx:24-35`），初值为 no-op 空函数，且每次 headerData 变化引发父级重渲染。
→ 改进：把 filter/report 状态提升到 page 层，直接传 props。

**【高】props 初始化 state 不同步**
`DashboardHeader.tsx:22-24`：`useState(filterSettings?.min_stock_price ?? 2)`，后端设置异步到达后 UI 永不同步。
→ 改进：改受控组件，或 `useEffect` 同步 / 用 `key` 重置。

### 2. 类型安全

- **【高】`lib/api.ts:551-552`**：`fetchIndicators(): Promise<any>`，返回值完全无类型。
- **【中】** `StockDetail.tsx:96-97` 多余的 `as any`（接口已声明该字段）；`page.tsx:68` `null as unknown as boolean` 伪造接口数据；`KlineChart.tsx:78-106`、`IndicatorCharts.tsx:21-55` 多处 `as any` 喂 lightweight-charts（应为 `as Time`）。
- tsconfig 已开 `strict: true`（好），建议加 `noUncheckedIndexedAccess`。

### 3. React 质量与性能

- **【中】useEffect 依赖问题**：`StockDetail.tsx:122` 依赖整个 `stock` 对象引用（父级重渲染即重跑含 setInterval 的加载分支）；`TradesPage.tsx:35`、`PaperTrackPage.tsx:29`、`SoldWatchPage.tsx:25` 依赖缺失 `load`（未 useCallback）。
- **【中】无竞态防护**：`StockSearch.tsx:28-40` 有 250ms 防抖（好）但无 AbortController，慢旧响应可覆盖新结果；`HoldingsPage.tsx:39-56` 快速切 tab 同理。
- **【中】超大组件**：`HoldingsPage.tsx` 525 行（含两个内联 Modal）、`TokenTotalPage.tsx` 481 行（内联 5 个子组件）、`BacktestPage.tsx:203` 25 个 useState（应 useReducer 或拆分）。
- **【中】O(n²) 渲染**：`TradesPage.tsx:76` `Math.max(...)` 写在 `monthly.map` 回调内，每次渲染重算，应提到循环外。
- **【低】key 用 index**：`StockDetail.tsx:243,247`、`RecommendationTable.tsx:254,258` 等 5 处。
- **【低】** 统一 10 分钟超时（`lib/api.ts:110`）对普通列表请求过长，应按接口分级。

### 4. 其他

- **【中】配色语义不一致**：A 股红涨绿跌，`HoldingsPage.tsx:208` 盈亏为正用红色，而 `TradesPage.tsx:54`、`PaperTrackPage.tsx:70` 同场景用绿色——同一产品两套约定。
- **【低】重复实现**：`components/StatCard.tsx` 与 `TokenTotalPage.tsx:265` 内联 `StatCard` 重名重复；`components/BacktestChart.tsx` 与 `backtest/BacktestCharts.tsx` 命名易混淆。
- **【低】** `layout.tsx:24` `dangerouslySetInnerHTML` 注入主题脚本（内容为静态字符串，风险低，建议改 `next/script`）。
- 正面：无硬编码密钥、API 地址走环境变量、搜索有防抖、tsconfig strict。

---

## 三、测试与工程化

| 维度 | 现状 | 建议 |
|---|---|---|
| 后端测试 | **覆盖率为 0**。`test_datasources.py` / `test_db.py` / `test_notify.py` 均为 print 驱动、零断言、打真实网络/DB/LLM 的调试脚本；无 pytest、无 conftest、无 mock | 引入 pytest + pytest-asyncio + respx/requests-mock；先给 rule_engine、calibrate_service、backtest_service 补纯函数单测（无需网络，性价比高）；三个调试脚本移到 `scripts/` 并改名 `diag_*.py` 以免误当测试 |
| 前端测试 | 完全缺失，package.json 无 test 脚本 | 引入 vitest + testing-library，先测 lib/api.ts 缓存失效逻辑 |
| CI/CD | 无 .github/workflows | 加 GitHub Actions：后端 `ast` 语法检查 + pytest，前端 `tsc --noEmit` + eslint + build |
| Docker | 单阶段构建、root 运行、无 HEALTHCHECK；backend `COPY . .` 会把 data/、test_*.py 打进镜像；frontend 未用 standalone 输出；Dockerfile 未提交进 git | 多阶段构建 + 非 root 用户 + HEALTHCHECK；frontend 开 `output: 'standalone'`；提交 Dockerfile 并补 .dockerignore |
| 文档 | 根目录无 README；frontend/README 是脚手架默认模板；AGENTS.md 中 Python 路径指向他人机器（`C:\Users\19412\...`） | 补根 README（架构图 + 启动步骤）；AGENTS.md 路径改为相对/占位 |
| .gitignore | 良好：.env、*.db、venv、node_modules 均未入库 | 补 `backend/data/` 其他产物（如 stock_list.json）按需要忽略 |

---

## 四、修复优先级路线图

**P0（本周，正确性/资损风险）**
1. 重负载 async handler 改 `asyncio.to_thread`（backtest/portfolio/scheduler 等）
2. 买入/撤销等资金操作加错误提示（前端 page.tsx）
3. `lib/api.ts` 缓存加写后失效
4. lifespan 补 `init_db()` / `close_all_connections()`
5. 修配置系统不一致（统一 `cfg.X` 引用或持久化）

**P1（两周内，安全/数据正确性）**
6. 写端点加 API key 鉴权
7. 15 处 `detail=str(e)` 改固定文案
8. 修共享缓存 DataFrame 原地修改、连接池脏事务、daily_job_log 僵尸 running
9. N+1 DB 查询（rule_params 循环外加载）

**P2（一个月内，工程化）**
10. pytest 基建 + 核心纯函数单测；前端 vitest
11. GitHub Actions CI
12. Docker 多阶段 + 非 root；提交 Dockerfile
13. 消除重复代码（backtest 双实现、agent 基类）、拆分超大组件
