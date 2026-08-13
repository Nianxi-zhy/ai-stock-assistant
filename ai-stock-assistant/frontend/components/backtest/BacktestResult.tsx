"use client";

import BacktestCharts from "./BacktestCharts";
import type { BacktestResult as BacktestResultType } from "./types";

interface BacktestResultProps {
  result: BacktestResultType;
}

export default function BacktestResult({ result }: BacktestResultProps) {
  const benchmarkDiff = result.total_pnl_pct - result.benchmark.total_return_pct;

  return (
    <>
      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <div className="text-xs font-medium text-(--color-text-secondary)">策略收益</div>
          <div className={`mt-1 text-lg font-bold ${result.total_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
            {result.total_pnl_pct >= 0 ? "+" : ""}{result.total_pnl_pct}%
          </div>
          <div className="text-xs text-(--color-text-tertiary)">¥{result.total_pnl >= 0 ? "+" : ""}{result.total_pnl.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <div className="text-xs font-medium text-(--color-text-secondary)">买入持有</div>
          <div className={`mt-1 text-lg font-bold ${result.benchmark.total_return_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
            {result.benchmark.total_return_pct >= 0 ? "+" : ""}{result.benchmark.total_return_pct}%
          </div>
          <div className="text-xs text-(--color-text-tertiary)">{result.benchmark.shares_bought} 股</div>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <div className="text-xs font-medium text-(--color-text-secondary)">超额收益</div>
          <div className={`mt-1 text-lg font-bold ${benchmarkDiff >= 0 ? "text-red-500" : "text-green-600"}`}>
            {benchmarkDiff >= 0 ? "+" : ""}{benchmarkDiff.toFixed(2)}%
          </div>
          <div className="text-xs text-(--color-text-tertiary)">vs 买入持有</div>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <div className="text-xs font-medium text-(--color-text-secondary)">胜率</div>
          <div className="mt-1 text-lg font-bold text-(--color-text-primary)">{result.win_rate}%</div>
          <div className="text-xs text-(--color-text-tertiary)">{result.win_trades}胜 {result.loss_trades}负</div>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <div className="text-xs font-medium text-(--color-text-secondary)">最大回撤</div>
          <div className="mt-1 text-lg font-bold text-red-500">{result.max_drawdown_pct}%</div>
        </div>
      </div>

      {/* Chart */}
      {result.kline.length > 0 && (
        <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <BacktestCharts result={result} />
        </div>
      )}

      {/* Trade log */}
      <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
        <div className="border-b border-(--color-border) px-5 py-3">
          <h3 className="text-sm font-bold text-(--color-text-primary)">交易记录（最近 {result.trades.length} 笔）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-(--color-border-light)">
                <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">日期</th>
                <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">类型</th>
                <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">价格</th>
                <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">股数</th>
                <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">盈亏</th>
                <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">收益率</th>
                <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">余额</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.map((t, i) => (
                <tr key={i} className="border-b border-[#F9FAFB] last:border-b-0">
                  <td className="px-5 py-2.5 text-(--color-text-primary)">{t.date}</td>
                  <td className="px-5 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${
                      t.type === "买入" ? "bg-(--color-accent-light) text-(--color-accent)" :
                      t.type === "卖出" || t.type === "平仓" ? "bg-green-50 text-green-600" : ""
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">¥{t.price.toFixed(3)}</td>
                  <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{t.shares ?? "-"}</td>
                  <td className={`px-5 py-2.5 text-right font-medium ${(t.pnl ?? 0) >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}¥${t.pnl.toFixed(2)}` : "-"}
                  </td>
                  <td className={`px-5 py-2.5 text-right font-medium ${(t.pnl_pct ?? 0) >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {t.pnl_pct != null ? `${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(2)}%` : "-"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">¥{t.cash_after.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer summary */}
      <div className="mt-4 rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
        <p className="text-xs text-(--color-text-secondary)">
          策略: {result.strategy} · 回测区间: {result.period_days} 天 · 本金: ¥{result.initial_cash.toLocaleString()} · 终值: ¥{result.final_cash.toLocaleString()}
        </p>
      </div>
    </>
  );
}
