# Project Rules

## 何时触发 → 执行什么

### 到期任务检查（每次会话开始必查）
- **LLM 价值对比报告**：若当前日期 >= 2026-08-23，运行
  `& "C:/Users/19412/anaconda3/envs/d2l-zh/python.exe" scripts/llm_value_report.py --days 30 --out "..\docs\llm_value_report.md"`（backend 目录），
  并向用户汇报结论（判断标准见 `docs/llm_value_analysis.md`）。报告已存在且当天生成过则跳过。

### 懒触发每日任务（代码已实现，无需人工）
- 每天 15:10 后用户首次打开应用 → 后端 `LazySchedulerMiddleware` 自动跑每日任务：
  1. 当天无推荐则自动跑一次轻量推荐（消耗 token，积累 candidate_log 对照组数据，`.env` 可关：`AUTO_RECOMMEND_ON_OPEN=false`）
  2. 每 5 天自动重校准规则权重（`calibrate_service.calibrate_rule_weights`，免费，写 rule_params 表，推荐管线自动生效）
  3. 每 3 天自动对最新推荐跑 walk-forward 刷新策略参数（写 strategy_params，一致性 ≥50% 且验证收益为正才标 active，否则仅存档）
  4. 对最新推荐批量回测落库（免费；若 strategy_params 有 active 参数则优先使用，否则默认网格）
- 每个自然日仅一次（`daily_job_log` 表防重）。周末自动跳过。

### 热重载失效处理（已踩坑）
- 后端热重载可能失效（worker 进程不再随代码更新重启，新端点 404）。
- 处理：先 touch main.py 触发重载，仍无效则重启后端：
  `Stop-Process` 杀掉 uvicorn 相关 python 进程后，
  `Start-Process -FilePath "C:\Users\19412\anaconda3\envs\d2l-zh\python.exe" -ArgumentList "-m","uvicorn","app.main:app","--reload","--port","8000" -WorkingDirectory "backend目录" -WindowStyle Hidden`

## 任务收尾 · 清理检查（每次任务完成必做）
- **每次任务/子 agent 完成后，必须检查并清理执行过程产生的冗余，防止磁盘/内存无限累积**：
  1. 运行清理脚本（backend 目录）：
     `& "C:/Users/19412/anaconda3/envs/d2l-zh/python.exe" scripts/cleanup_dev.py`
     （清理 opencode 临时文件、__pycache__、.next 缓存、WAL 残留；.next 前端运行中只清 cache）
  2. 任务中创建的临时脚本/输出文件（如 C:/Users/19412/AppData/Local/Temp/opencode/ 下新建的）用后即删，不留到收尾
  3. 检查 python 进程数：uvicorn 正常 = reloader+worker 共 2 个；多出且非用户其他项目（如 gemma3_train 训练脚本）的是僵尸，需处理
  4. **绝不删除用户数据**：DB（backend/data/*.db）、stock_list.json、.env、.env.local、上传文件、以及非本项目目录（如 gemma3_train）
- 若清理脚本输出异常（如 .next 超大且前端未运行），说明有遗漏，手动定位清理

## Python 命令 (必须)
- **运行任何 Python 代码/脚本/语法检查时**,一律使用:
  `C:\Users\19412\anaconda3\envs\d2l-zh\python.exe` (或 `conda run -n d2l-zh python`)
- ⚠️ PATH 里的裸 `python` 是 Windows 商店占位符 (WindowsApps\python.exe),运行会静默无输出,禁止使用
- 例: `& "C:\Users\19412\anaconda3\envs\d2l-zh\python.exe" -c "..."` / `& "...\python.exe" script.py`

## Backend (uvicorn)
- `run.py` 已配置 `reload=True`,修改 .py 文件后 uvicorn 自动热重载
- **不要手动杀进程或重启后端**,改完代码等 2-3 秒即可
- 除非后端彻底卡死(如单 worker 被 LLM 调用阻塞),否则不碰进程
- 启动: `uvicorn app.main:app --reload --port 8000`

## Frontend (Next.js)
- `npm run dev` 已支持热更新,改完前端代码自动刷新
- 启动: `npm run dev --port 3000`
- 验证前端: `npx tsc --noEmit` (typecheck), `npx eslint <file>` (lint)

## 验证命令
- 后端语法检查: `& "C:\Users\19412\anaconda3\envs\d2l-zh\python.exe" -c "import ast,glob; files=glob.glob('app/**/*.py', recursive=True); [ast.parse(open(f, encoding='utf-8-sig').read()) for f in files]; print('syntax OK:', len(files))"` (在 backend 目录执行)

## Environment
- Python: Anaconda `d2l-zh` 环境,完整路径 `C:\Users\19412\anaconda3\envs\d2l-zh\python.exe`
- Windows OS (注意进程管理行为)
