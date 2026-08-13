"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import type { HoldingAdvice } from "@/lib/api";
import { fetchHoldingsAdvice } from "@/lib/api";
import { GLASS_CARD } from "@/lib/glass";

const ACTION_STYLES: Record<string, { label: string; class: string; icon: string }> = {
  danger: { label: "卖出", class: "bg-red-50 text-red-600 border-red-100", icon: "🔴" },
  warning: { label: "减仓观察", class: "bg-amber-50 text-amber-600 border-amber-100", icon: "⚠️" },
  success: { label: "继续持有", class: "bg-green-50 text-green-600 border-green-100", icon: "✅" },
  info: { label: "继续持有", class: "bg-blue-50 text-blue-600 border-blue-100", icon: "💡" },
  default: { label: "继续持有", class: "bg-(--color-bg-hover) text-(--color-text-secondary) border-(--color-border-light)", icon: "📊" },
};

function BasketIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="52" rx="18" ry="6" fill="#FFE4E1" />
      <path d="M18 28H46L42 48H22L18 28Z" fill="#FFF8F0" stroke="#FFB7C5" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 28C24 28 26 18 32 18C38 18 40 28 40 28" stroke="#D4A574" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 34H42" stroke="#FFB7C5" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 40H41" stroke="#FFB7C5" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 46H40" stroke="#FFB7C5" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="26" cy="24" r="2" fill="#FFD700" />
      <circle cx="38" cy="26" r="1.5" fill="#7ED9B0" />
      <circle cx="32" cy="22" r="1.5" fill="#A7D8FF" />
    </svg>
  );
}

export default function PortfolioPanel({
  onNavigateToHoldings,
}: {
  onNavigateToHoldings?: () => void;
}) {
  const [adviceList, setAdviceList] = useState<HoldingAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (showLoading = true) => {
    setError("");
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await fetchHoldingsAdvice();
      setAdviceList(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial data fetch; loading state is required for the first render skeleton.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const totalMv = adviceList.reduce((s, a) => s + (a.market_value || 0), 0);
  const totalPnl = adviceList.reduce((s, a) => s + (a.pnl_amount || 0), 0);
  const totalPnlColor = totalPnl >= 0 ? "text-green-600" : "text-red-500";

  return (
    <div className={GLASS_CARD}>
      <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-50 text-lg text-pink-500">
            💼
          </span>
          <h2 className="text-base font-extrabold text-(--color-text-primary)">我的持仓</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-(--color-bg-raised) px-2.5 py-1 text-[10px] font-bold tabular-nums text-(--color-text-secondary)">
            {adviceList.length} 只
          </span>
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            title="刷新价格"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-(--color-text-tertiary) transition-all hover:scale-110 hover:bg-(--color-bg-raised) hover:text-(--color-accent) disabled:opacity-40"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => load(true)} className="font-medium underline hover:no-underline">重试</button>
        </div>
      )}

      {adviceList.length === 0 ? (
        <div className="portfolio-empty flex flex-col items-center justify-center px-5 py-10 text-center">
          <BasketIcon />
          <p className="mt-4 text-sm font-bold text-(--color-text-primary)">暂无持仓</p>
          <p className="mt-1 text-xs text-(--color-text-tertiary)">快去挑选心仪股票吧～</p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-3 gap-2 border-y border-[color-mix(in_srgb,var(--color-border-light)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-bg-raised)_60%,transparent)] px-4 py-3 backdrop-blur-md">
            <div className="flex flex-col items-center rounded-2xl bg-white/60 py-2">
              <p className="text-[10px] leading-none text-(--color-text-tertiary)">持仓数</p>
              <p className="mt-1.5 text-sm font-extrabold tabular-nums text-(--color-text-primary)">
                {adviceList.length} 只
              </p>
            </div>
            <div className="flex flex-col items-center rounded-2xl bg-white/60 py-2">
              <p className="text-[10px] leading-none text-(--color-text-tertiary)">总市值</p>
              <p className="mt-1.5 text-sm font-extrabold tabular-nums text-(--color-text-primary)">
                ¥{totalMv.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex flex-col items-center rounded-2xl bg-white/60 py-2">
              <p className="text-[10px] leading-none text-(--color-text-tertiary)">累计浮盈</p>
              <p className={`mt-1.5 whitespace-nowrap text-sm font-extrabold tabular-nums ${totalPnlColor}`}>
                {totalPnl < 0 ? "-" : ""}¥{Math.abs(totalPnl).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="mt-2 divide-y divide-(--color-border-light)">
            {adviceList.map((a) => {
              const pnlColor = a.pnl_pct >= 0 ? "text-green-600" : "text-red-500";
              const action = ACTION_STYLES[a.severity] || ACTION_STYLES.default;
              const daysLabel = (a.days_held ?? 0) <= 0 ? "首日" : `第 ${a.days_held} 天`;

              return (
                <div key={a.holding_id} className="px-5 py-3.5">
                  {/* Row 1: name + days tag */}
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-bold text-(--color-text-primary)">{a.name}</span>
                      <span className="text-[10px] tabular-nums text-(--color-text-tertiary)">{a.code}</span>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-(--color-accent-light) px-2 py-0.5 text-[10px] font-bold text-(--color-accent)">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" d="M12 6v6l4 2" />
                      </svg>
                      {daysLabel}
                    </span>
                  </div>

                  {/* Row 2: prices + PnL */}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-3 font-mono text-xs font-semibold tabular-nums text-(--color-text-secondary)">
                      <span>成本 ¥{a.buy_price.toFixed(2)}</span>
                      <span>现价 ¥{a.current_price.toFixed(2)}</span>
                    </div>
                    <div className={`flex items-center gap-2 text-sm font-extrabold tabular-nums ${pnlColor}`}>
                      <span>¥{Math.abs(a.pnl_amount).toFixed(2)}</span>
                      <span>{a.pnl_pct >= 0 ? "+" : ""}{a.pnl_pct.toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* Row 3: action badge + 展开建议按钮 */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${action.class}`}>
                      <span>{action.icon}</span>
                      {action.label}
                    </span>
                    {a.suggested_sell_price != null && a.suggested_sell_price > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-(--color-bg-hover) px-2 py-0.5 text-[10px] font-medium text-(--color-text-secondary)">
                        建议卖出 ¥{a.suggested_sell_price.toFixed(2)}
                      </span>
                    )}
                    {a.reason && (
                      <button
                        onClick={() => setExpandedId(expandedId === a.holding_id ? null : a.holding_id)}
                        className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-(--color-accent) transition-colors hover:bg-(--color-accent-light)"
                      >
                        <span>{expandedId === a.holding_id ? "收起建议" : "查看建议"}</span>
                        <svg
                          className={`h-3 w-3 transition-transform ${expandedId === a.holding_id ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* 展开后的详细建议 */}
                  {a.reason && expandedId === a.holding_id && (
                    <div className="mt-2 rounded-xl border border-(--color-border-light) bg-(--color-bg-raised) px-3 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-[10px]">💡</span>
                        <span className="text-[10px] font-bold text-(--color-text-secondary)">
                          AI 建议详情{a.llm_analyzed ? "" : "（规则推断）"}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-(--color-text-primary) whitespace-pre-wrap">
                        {a.reason}
                      </p>
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
          className="text-xs font-bold text-(--color-accent) transition-colors hover:text-(--color-accent-hover)"
        >
          查看更多持仓 →
        </button>
      </div>
    </div>
  );
}
