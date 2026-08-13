"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import type { HoldingAdvice } from "@/lib/api";
import { fetchHoldingsAdvice } from "@/lib/api";
import { GLASS_CARD } from "@/lib/glass";

const SEVERITY_STYLES: Record<string, { badge: string; icon: string }> = {
  danger: { badge: "bg-red-50 text-red-700 border-red-200", icon: "🔴" },
  warning: { badge: "bg-amber-50 text-amber-700 border-amber-200", icon: "⚠️" },
  success: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "✅" },
  info: { badge: "bg-(--color-accent-light) text-blue-700 border-blue-200", icon: "💡" },
  default: { badge: "bg-gray-50 text-gray-600 border-gray-200", icon: "📊" },
};

function ActionBadge({ severity, action }: { severity: string; action: string }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.default;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.badge}`}>
      <span className="text-[11px]">{s.icon}</span>
      {action}
    </span>
  );
}

function DaysTag({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono font-medium bg-(--color-accent-light) text-(--color-accent)">
      <svg className="h-3 w-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" d="M12 6v6l4 2" />
      </svg>
      第 {days} 天
    </span>
  );
}

export default function PortfolioPanel({
  onNavigateToHoldings,
}: {
  onNavigateToHoldings?: () => void;
}) {
  const [adviceList, setAdviceList] = useState<HoldingAdvice[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await fetchHoldingsAdvice();
      setAdviceList(r.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${GLASS_CARD}`}>
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" />
          <p className="text-xs text-(--color-text-secondary)">正在获取持仓数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={GLASS_CARD}>
      <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-accent-light) text-(--color-accent)">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </span>
          <h2 className="text-base font-bold text-(--color-text-primary)">我的持仓</h2>
          {refreshing && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-(--color-bg-raised) px-2.5 py-1 text-[10px] font-medium tabular-nums text-(--color-text-secondary)">
            {adviceList.length} 只
          </span>
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            title="刷新价格"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-raised) hover:text-(--color-accent) disabled:opacity-40"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {adviceList.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-(--color-text-tertiary)">
          暂无持仓
        </div>
      ) : (
        <div>
          {(() => {
            const totalMv = adviceList.reduce((s, a) => s + (a.market_value || 0), 0);
            const totalPnl = adviceList.reduce((s, a) => s + (a.pnl_amount || 0), 0);
            const totalColor = totalPnl >= 0 ? "text-green-600" : "text-red-500";
            return (
              <div className="grid grid-cols-3 border-y border-[color-mix(in_srgb,var(--color-border-light)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-bg-raised)_60%,transparent)] px-5 py-3 backdrop-blur-md">
                <div className="flex flex-col items-center">
                  <p className="text-[10px] leading-none text-(--color-text-tertiary)">持仓数</p>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums text-(--color-text-primary)">
                    {adviceList.length} 只
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-[10px] leading-none text-(--color-text-tertiary)">总市值</p>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums text-(--color-text-primary)">
                    ¥{totalMv.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-[10px] leading-none text-(--color-text-tertiary)">累计浮盈</p>
                  <p className={`mt-1.5 whitespace-nowrap text-sm font-semibold tabular-nums ${totalColor}`}>
                    {totalPnl < 0 ? "-" : ""}¥{Math.abs(totalPnl).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="mt-2 divide-y divide-(--color-border-light)">
            {adviceList.map((a) => {
              const pnlColor = a.pnl_pct >= 0 ? "text-green-600" : "text-red-500";
              const barWidth = Math.min(Math.abs(a.pnl_pct) / 20, 1) * 100;
              const isExpanded = expandedId === a.holding_id;

              return (
                <div key={a.holding_id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : a.holding_id)}
                    className={`flex w-full flex-col px-5 py-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-bg-raised)_55%,transparent)] ${isExpanded ? "bg-[color-mix(in_srgb,var(--color-bg-raised)_55%,transparent)]" : ""}`}
                  >
                    {/* Row 1: name + days tag */}
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-(--color-text-primary)">{a.name}</span>
                        <span className="text-[10px] tabular-nums text-(--color-text-tertiary)">{a.code}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <DaysTag days={a.days_held} />
                        <ChevronDown
                          size={14}
                          className={`text-(--color-text-tertiary) transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>

                    {/* Row 2: prices + PnL */}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono text-xs font-semibold tabular-nums text-(--color-text-secondary)">
                        <span className="w-[88px] whitespace-nowrap">成本 ¥{a.buy_price.toFixed(2)}</span>
                        <span className="w-[88px] whitespace-nowrap">现价 ¥{a.current_price.toFixed(2)}</span>
                      </div>
                      <div className={`flex items-center whitespace-nowrap text-sm font-bold tabular-nums ${pnlColor}`}>
                        <span className="w-[76px] text-left">
                          {a.pnl_amount < 0 ? "-" : ""}¥{Math.abs(a.pnl_amount).toFixed(2)}
                        </span>
                        <span className="w-[64px] text-left">
                          {a.pnl_pct < 0 ? "-" : ""}{Math.abs(a.pnl_pct).toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Row 3: action badge + position strength bar */}
                    <div className="mt-2 flex items-center gap-3">
                      <ActionBadge severity={a.severity} action={a.action} />
                      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-(--color-bg-hover)">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${a.pnl_pct >= 0 ? "bg-green-500" : "bg-red-500"}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-(--color-border-light) bg-(--color-bg-main) px-5 py-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-[11px] text-(--color-text-secondary)">建议</span>
                        <p className="text-xs leading-relaxed text-(--color-text-primary)">
                          {a.reason}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-(--color-text-tertiary)">
                        <span>已持 {a.days_held} 天</span>
                        {a.suggested_sell_price != null && (
                          <span className="font-mono tabular-nums text-blue-500">建议卖出价 ¥{a.suggested_sell_price.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-(--color-border) px-5 py-3 text-center">
        <button
          onClick={onNavigateToHoldings}
          className="text-xs font-medium text-(--color-accent) transition-colors hover:text-(--color-accent-hover)"
        >
          查看更多持仓 →
        </button>
      </div>
    </div>
  );
}
