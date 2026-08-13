"""每日自动执行脚本：可被 Windows 任务计划程序调用"""
import sys
from datetime import date

import akshare as ak
import app.config  # noqa: F401

from app.services.daily_service import run_daily_routine


def is_trading_day(today: date) -> bool:
    try:
        df = ak.tool_trade_date_hist_sina()
        return today in set(df["trade_date"].values)
    except Exception:
        return today.weekday() < 5  # 出错时退回到仅判断周末


def main() -> None:
    today = date.today()

    print("=" * 60)
    print(f"AI 投研助手 — {today}")
    print("=" * 60)

    if not is_trading_day(today):
        print("⏭ 今日非交易日，跳过执行")
        sys.exit(0)

    result = run_daily_routine()

    print("\n" + "=" * 60)
    print("执行结果")
    print("=" * 60)
    print(f"日期: {result.date}")
    print(f"持仓回顾: {result.holdings_reviewed} 只")
    print(f"新候选: {result.new_candidates} 只")
    print(f"新推荐: {result.new_recommendations} 只")
    usage = result.total_token_usage
    print(f"Token: {usage['total_tokens']} | 费用: {usage['cost_rmb']:.4f} 元")

    print("\n持仓明细:")
    for r in result.reviews:
        print(f"  {r.code} {r.name} | {r.action} | 评分={r.score} | 盈亏={r.pnl_pct:+.2f}%")

    if result.new_recommendations == 0:
        print("\n⚠ 今日无新推荐。")

    print("\n✓ 每日流程执行完毕")
    sys.exit(0)


if __name__ == "__main__":
    main()
