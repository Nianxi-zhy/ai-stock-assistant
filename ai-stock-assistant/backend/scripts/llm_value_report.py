"""LLM 增量价值对比报告（阶段 5，第 2 件事）

数据源：candidate_log 表（推荐管线对照组）
- llm_buy：规则选中 + LLM 分析后判定"买入"的候选
- llm_rejected：规则选中 + LLM 分析后判定"非买入"的候选
- candidate（未分析/失败）：规则选中但未进入 LLM 分析

方法：对每个候选，取 recommend_date 当日收盘价（无则之后第一根）为基准，
计算其后 5/10/20 个交易日的累计涨幅；分组统计平均涨幅、胜率、样本数。

用法：
  & "C:/Users/19412/anaconda3/envs/d2l-zh/python.exe" scripts/llm_value_report.py [--days 30] [--out docs/llm_value_report.md]
在 backend 目录下执行。
"""
import argparse
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from app.db import get_connection
from app.services.stock_service import get_kline

HORIZONS = (5, 10, 20)


def _fetch_candidates(days: int):
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT run_id, recommend_date, code, name, status, llm_analyzed,
                      llm_score, rule_score
               FROM candidate_log
               WHERE recommend_date >= date('now', ?, 'localtime')
               ORDER BY recommend_date, id""",
            (f"-{days} days",),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _entry_and_returns(code: str, recommend_date: str) -> tuple:
    """返回 (entry_price, {h: 涨幅_pct})，取 recommend_date 当日或之后第一根 K 线为基准。"""
    try:
        df = get_kline(code, days=90)
    except Exception:
        return None, None
    if df is None or df.empty:
        return None, None
    df = df.reset_index(drop=True)
    dates = df["date"].astype(str)
    start = pd.Index(dates).searchsorted(recommend_date, side="left")
    if start >= len(df):
        return None, None
    entry = float(df.iloc[start]["close"])
    if entry <= 0:
        return None, None
    returns = {}
    for h in HORIZONS:
        idx = start + h
        if idx < len(df):
            returns[h] = round((float(df.iloc[idx]["close"]) / entry - 1) * 100, 2)
    return entry, returns


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30, help="回看多少天内的候选（默认 30）")
    parser.add_argument("--out", default="", help="可选：把报告写入该 markdown 文件")
    args = parser.parse_args()

    candidates = _fetch_candidates(args.days)
    groups = {
        "llm_buy": [],
        "llm_rejected": [],
        "未分析候选": [],
    }
    skipped = 0
    for c in candidates:
        if c["status"] == "llm_buy":
            group = "llm_buy"
        elif c["status"] == "llm_rejected":
            group = "llm_rejected"
        else:
            group = "未分析候选"
        entry, returns = _entry_and_returns(c["code"], c["recommend_date"])
        if entry is None:
            skipped += 1
            continue
        groups[group].append({**c, "entry": entry, "returns": returns})

    today = date.today().isoformat()
    lines = [f"# LLM 增量价值对比报告（生成于 {today}，回看 {args.days} 天）", ""]
    lines.append("> 数据源 candidate_log：规则选中但被 LLM 否掉的候选 vs LLM 判定买入的候选，后续涨幅对比。")
    lines.append("> 意义：若 llm_buy 平均涨幅显著高于 llm_rejected，则 LLM 分析有增量价值；反之则 LLM 只是在烧钱。")
    lines.append("")

    header = "| 分组 | 样本 | " + " | ".join(f"{h}日平均涨幅" for h in HORIZONS) + " | " + " | ".join(f"{h}日胜率" for h in HORIZONS) + " |"
    sep = "| --- | --- | " + " | ".join(["---"] * (len(HORIZONS) * 2)) + " |"
    lines.append(header)
    lines.append(sep)

    def stats(rows):
        out = []
        for h in HORIZONS:
            vals = [r["returns"][h] for r in rows if h in r["returns"]]
            if vals:
                avg = sum(vals) / len(vals)
                win = sum(1 for v in vals if v > 0) / len(vals) * 100
                out.append(f"{avg:+.2f}%")
                out.append(f"{win:.0f}%")
            else:
                out.append("-")
                out.append("-")
        return out

    for name, rows in groups.items():
        n = len(rows)
        if n == 0:
            lines.append(f"| {name} | 0 | " + " | ".join(["-"] * (len(HORIZONS) * 2)) + " |")
            continue
        lines.append(f"| {name} | {n} | " + " | ".join(stats(rows)) + " |")

    lines.append("")
    lines.append(f"（{skipped} 条候选因行情数据不足未计入）")
    lines.append("")
    lines.append("## 明细")
    lines.append("")
    lines.append("| 日期 | 代码 | 名称 | 分组 | 规则分 | LLM分 | 基准价 | " + " | ".join(f"{h}日涨幅" for h in HORIZONS) + " |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | " + " | ".join(["---"] * len(HORIZONS)) + " |")
    for name, rows in groups.items():
        for r in rows:
            ret_cells = " | ".join(f"{r['returns'].get(h, '-'):+}%" for h in HORIZONS)
            lines.append(
                f"| {r['recommend_date']} | {r['code']} | {r['name']} | {name} | {r['rule_score']} | {r['llm_score']} | {r['entry']} | {ret_cells} |"
            )

    text = "\n".join(lines)
    print(text)
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text, encoding="utf-8")
        print(f"\n已写入 {out_path}")


if __name__ == "__main__":
    main()
