# LLM 增量价值对比计划（阶段 5 · 第 2 件事）

> 本文件是"到期自动执行"提醒的依据，**不要删除**。到期时（或之后任何会话开始），先看下方"到期检查"。

## 目标

回答一个问题：**LLM 分析到底有没有用？**
- 若 LLM 判定"买入"的股票，后续涨幅显著高于被 LLM 否掉的股票 → LLM 有增量价值，值得继续花钱。
- 反之 → LLM 只是在烧 token，推荐管线应改成纯规则（省钱）。

## 数据源与积累方式（2026-08-09 起生效）

- 表：`candidate_log`（recommend_service.py 写入，阶段 4.4 已实现）
- 自动积累：后端懒触发（`LazySchedulerMiddleware`，阶段 5 已实现）——每天 15:10 后用户首次打开应用时，后台自动：
  1. 若当天还没有推荐 → 跑一次轻量推荐（`AUTO_RECOMMEND_ON_OPEN=true`，默认开；候选 5 只、top 3，消耗 LLM token 约几毛钱/天）
  2. 对最新推荐批量回测（免费）落 `backtest_runs`
  - 每个自然日只跑一次（`daily_job_log` 防重）
  - 关闭自动推荐：`.env` 里设 `AUTO_RECOMMEND_ON_OPEN=false`（注意：关掉后 candidate_log 不再积累，对比报告会失去数据）

## 到期时间与执行

- **起算日**：2026-08-09（candidate_log 首次有真实数据）
- **首次报告日**：2026-08-23 前后（10 个交易日 ≈ 14 个自然日，与纸面观察期一致）
- **执行命令**（backend 目录）：
  ```
  & "C:/Users/19412/anaconda3/envs/d2l-zh/python.exe" scripts/llm_value_report.py --days 30 --out "..\docs\llm_value_report.md"
  ```
- 报告包含：llm_buy / llm_rejected / 未分析候选 三组的 5/10/20 日平均涨幅与胜率 + 逐条明细。
- 之后每周可重复运行一次，数据越多结论越可靠。

## 判断标准（写报告时对照）

- 样本不足（每组 < 10）：只存档，不下结论。
- llm_buy 平均涨幅 - llm_rejected 平均涨幅 ≥ +3pp（且样本足够）：LLM 有效 → 保持现状，向用户汇报。
- 接近 0 或为负：LLM 无增量价值 → 向用户建议关闭 LLM 分析（或缩小候选池省钱），报告写明数据。

## 到期检查（AGENTS.md 同步了一份）

每次会话开始，如果**当前日期 >= 2026-08-23** 且 `docs/llm_value_report.md` 不存在或早于上次检查日期，运行上面的命令并汇报结论。样本不足时在报告中注明"数据仍不足"，并继续等待。
