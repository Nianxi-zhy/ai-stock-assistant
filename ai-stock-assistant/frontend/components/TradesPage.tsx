"use client";

import { useEffect, useState } from "react";
import type { TradeListResponse, TradeStatsResponse, MonthlyPnL } from "@/lib/api";
import { fetchTrades, fetchTradeStats, fetchMonthlyPnL } from "@/lib/api";
import { GLASS_CARD } from "@/lib/glass";
import StatCard from "./StatCard";

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeListResponse | null>(null);
  const [stats, setStats] = useState<TradeStatsResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortDir, setSortDir] = useState("desc");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchTrades(100, filterType || undefined, sortDir),
      fetchTradeStats(),
      fetchMonthlyPnL(),
    ])
      .then(([t, s, m]) => {
        setTrades(t);
        setStats(s);
        setMonthly(m);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load() }, [filterType, sortDir]);

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      <h2 className="text-lg font-bold text-(--color-text-primary)">交易记录</h2>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">历史交易与统计</p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={load} className="font-medium underline hover:no-underline">重试</button>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="总交易" value={stats.total_trades.toString()} />
          <StatCard label="胜率" value={`${stats.win_rate}%`} />
          <StatCard label="总盈亏" value={`¥${stats.total_pnl.toFixed(2)}`} color={stats.total_pnl >= 0 ? "text-green-600" : "text-red-500"} />
          <StatCard label="平均收益率" value={`${stats.avg_return}%`} color={stats.avg_return >= 0 ? "text-green-600" : "text-red-500"} />
          <StatCard label="最大回撤" value={`${stats.max_drawdown}%`} color="text-red-500" />
          <StatCard label="平均持仓" value={`${stats.avg_holding_days} 天`} />
          <StatCard label="盈利笔" value={String(stats.win_count)} color="text-green-600" />
          <StatCard label="亏损笔" value={String(stats.loss_count)} color="text-red-500" />
          <StatCard label="最高收益" value={`${stats.max_return}%`} color="text-green-600" />
          <StatCard label="最低收益" value={`${stats.min_return}%`} color="text-red-500" />
        </div>
      )}

      {/* Monthly chart */}
      {monthly.length > 0 && (
        <div className={`${GLASS_CARD} mt-6 p-6`}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-(--color-text-primary)">月度收益</h3>
            <span className="text-[10px] text-(--color-text-tertiary)">
              按卖出月份统计 · {monthly.length} 个月
            </span>
          </div>
          <div className="flex h-40 items-end gap-3">
            {monthly.map((m, i) => {
              const maxAbs = Math.max(...monthly.map((x) => Math.abs(x.total_pnl)), 1);
              const barH = Math.max((Math.abs(m.total_pnl) / maxAbs) * 100, 4);
              const isPositive = m.total_pnl >= 0;
              const isLatest = i === monthly.length - 1;
              const winRate = m.trade_count ? Math.round((m.win_count / m.trade_count) * 100) : 0;
              return (
                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span className={`whitespace-nowrap text-[10px] font-semibold tabular-nums ${isPositive ? "text-green-600" : "text-red-500"}`}>
                    {m.total_pnl >= 0 ? "+" : ""}¥{m.total_pnl.toFixed(0)}
                  </span>
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div
                      className={`w-full max-w-[56px] rounded-t-md transition-opacity duration-300 hover:opacity-80 ${
                        isPositive
                          ? "bg-[linear-gradient(to_top,rgba(34,197,94,0.35),rgba(34,197,94,0.85))]"
                          : "bg-[linear-gradient(to_top,rgba(239,68,68,0.35),rgba(239,68,68,0.85))]"
                      } ${isLatest ? "ring-2 ring-(--color-accent)" : ""}`}
                      // barH 是运行时计算百分比，无法用静态 Tailwind 类表达
                      style={{ height: `${barH}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-[10px] tabular-nums text-(--color-text-tertiary)">
                    {m.month.slice(5)}月
                    {isLatest && <span className="ml-1 font-semibold text-(--color-accent)">本月</span>}
                  </span>
                  <span className="whitespace-nowrap text-[9px] tabular-nums text-(--color-text-tertiary)">
                    {m.trade_count} 笔 · 胜率 {winRate}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text-secondary) outline-none focus:border-blue-400"
        >
          <option value="">全部类型</option>
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
          <option value="add">加仓</option>
          <option value="reduce">减仓</option>
        </select>
        <button
          onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
          className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-raised)"
        >
          {sortDir === "desc" ? "最新优先 ↓" : "最早优先 ↑"}
        </button>
        <span className="text-xs text-(--color-text-tertiary)">
          {trades ? `共 ${trades.count} 条` : ""}
        </span>
      </div>

      {/* Trades table */}
      <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
          </div>
        ) : !trades || trades.items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-(--color-text-secondary)">暂无交易记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-(--color-border-light)">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">日期</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">股票</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">价格</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">数量</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">盈亏</th>
                </tr>
              </thead>
              <tbody>
                {trades.items.map((t) => (
                  <tr key={t.id} className="border-b border-[#F9FAFB] transition-colors hover:bg-[#FAFBFC]">
                    <td className="px-6 py-3.5 text-xs font-mono text-(--color-text-secondary)">{t.trade_date}</td>
                    <td className="px-6 py-3.5">
                      <div className="text-sm font-semibold text-(--color-text-primary)">{t.name}</div>
                      <div className="text-[10px] text-(--color-text-tertiary)">{t.code}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.trade_type === "buy" ? "bg-green-100 text-green-700" :
                        t.trade_type === "sell" ? "bg-red-100 text-red-700" :
                        t.trade_type === "add" ? "bg-blue-100 text-blue-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {{buy:"买入",sell:"卖出",add:"加仓",reduce:"减仓"}[t.trade_type] || t.trade_type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm font-mono text-(--color-text-primary)">¥{t.price.toFixed(3)}</td>
                    <td className="px-6 py-3.5 text-sm font-mono text-(--color-text-secondary)">{t.quantity}</td>
                    <td className="px-6 py-3.5">
                      {t.trade_type === "sell" ? (
                        <span className={`text-sm font-semibold ${t.pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {t.pnl >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-sm text-(--color-text-tertiary)">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

