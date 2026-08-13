"use client";

import type { BacktestRunsResponse } from "./types";

interface BacktestHistoryProps {
  history: BacktestRunsResponse | null;
  onRefresh: () => void;
}

export default function BacktestHistory({ history, onRefresh }: BacktestHistoryProps) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-(--color-text-primary)">
          历史测试记录
          {history && history.total_runs > 0 && (
            <span className="ml-2 text-xs font-normal text-(--color-text-tertiary)">累计 {history.total_runs} 次回测已自动沉淀</span>
          )}
        </h3>
        <button
          onClick={onRefresh}
          className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-raised) hover:text-(--color-text-primary)"
        >
          刷新
        </button>
      </div>

      {!history ? (
        <p className="mt-3 text-xs text-(--color-text-tertiary)">加载中...</p>
      ) : history.strategy_stats.length === 0 ? (
        <p className="mt-3 rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 text-xs text-(--color-text-tertiary)">
          还没有回测记录。在上面选择股票和策略点「开始回测」，结果会自动保存到这里，用于跨策略对比。
        </p>
      ) : (
        <>
          {/* 按策略聚合统计 */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {history.strategy_stats.map((s) => (
              <div key={s.strategy_key} className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-(--color-text-primary)">{s.strategy_name}</span>
                  <span className="rounded-full bg-(--color-bg-raised) px-2 py-0.5 text-[11px] text-(--color-text-tertiary)">{s.run_count} 次</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-lg font-bold ${s.avg_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {s.avg_pnl_pct >= 0 ? "+" : ""}{s.avg_pnl_pct}%
                  </span>
                  <span className="text-[11px] text-(--color-text-tertiary)">平均收益</span>
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-(--color-text-secondary)">
                  <span>胜率 {s.avg_win_rate}%</span>
                  <span>回撤 {s.avg_max_drawdown}%</span>
                  <span>盈利 {s.profitable_runs}/{s.run_count} 次</span>
                </div>
              </div>
            ))}
          </div>

          {/* 明细表 */}
          <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
            <div className="border-b border-(--color-border) px-5 py-3">
              <h3 className="text-sm font-bold text-(--color-text-primary)">最近记录</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-(--color-border-light)">
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">时间</th>
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">股票</th>
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">策略</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">天数</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">收益</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">买入持有</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">胜率</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">交易数</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">最大回撤</th>
                  </tr>
                </thead>
                <tbody>
                  {history.runs.map((r) => (
                    <tr key={r.id} className="border-b border-[#F9FAFB] last:border-b-0">
                      <td className="px-5 py-2.5 text-(--color-text-tertiary)">{r.created_at.slice(5, 16)}</td>
                      <td className="px-5 py-2.5 text-(--color-text-primary)">{r.name || r.code} <span className="text-(--color-text-tertiary)">{r.code}</span></td>
                      <td className="px-5 py-2.5 text-(--color-text-secondary)">{r.strategy_name}</td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{r.days}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${r.total_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {r.total_pnl_pct >= 0 ? "+" : ""}{r.total_pnl_pct}%
                      </td>
                      <td className={`px-5 py-2.5 text-right ${r.benchmark_return_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {r.benchmark_return_pct >= 0 ? "+" : ""}{r.benchmark_return_pct}%
                      </td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{r.win_rate}%</td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{r.total_trades}</td>
                      <td className="px-5 py-2.5 text-right text-red-500">{r.max_drawdown_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
