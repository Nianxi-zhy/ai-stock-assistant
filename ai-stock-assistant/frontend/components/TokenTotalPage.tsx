"use client";

import { useEffect, useState } from "react";
import type { TokenTotalResponse, DailyUsage } from "@/lib/api";
import { fetchTokenTotal } from "@/lib/api";

export default function TokenTotalPage({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<TokenTotalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => { // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchTokenTotal()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-(--color-bg-hover)" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-(--color-bg-hover)" />
            ))}
          </div>
          <div className="h-96 rounded-2xl bg-(--color-bg-hover)" />
        </div>
      </div>
    );
  }

  if (!data || data.total_calls === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-6">
        <div className="mb-1">
          <h1 className="text-2xl font-bold tracking-tight text-(--color-text-primary)">总计 Token</h1>
          <p className="mt-0.5 text-sm text-(--color-text-secondary)">查看 AI 分析资源消耗与使用统计</p>
        </div>
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-(--color-border) bg-(--color-bg-card) py-16">
          <div className="text-4xl text-(--color-text-tertiary)">📊</div>
          <p className="mt-4 text-sm font-medium text-(--color-text-secondary)">暂无数据，请先运行一次分析</p>
        </div>
      </div>
    );
  }

  const dailySorted = [...data.daily_usage].sort((a, b) => a.date.localeCompare(b.date));
  const last30 = dailySorted.slice(-30);

  const avgDailyTokens = data.daily_usage.length > 0
    ? Math.round(data.daily_usage.reduce((s, d) => s + d.total_tokens, 0) / data.daily_usage.length)
    : 0;
  const avgDailyCost = data.daily_usage.length > 0
    ? data.daily_usage.reduce((s, d) => s + d.cost_rmb, 0) / data.daily_usage.length
    : 0;
  const maxDayTokens = data.daily_usage.length > 0
    ? data.daily_usage.reduce((max, d) => d.total_tokens > max.total_tokens ? d : max, data.daily_usage[0])
    : null;
  const maxDayCost = data.daily_usage.length > 0
    ? data.daily_usage.reduce((max, d) => d.cost_rmb > max.cost_rmb ? d : max, data.daily_usage[0])
    : null;

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(data.daily_usage.length / pageSize));
  const pagedDaily = data.daily_usage.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--color-text-primary)">总计 Token</h1>
          <p className="mt-0.5 text-sm text-(--color-text-secondary)">查看 AI 分析资源消耗与使用统计</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="累计分析次数"
          value={data.total_calls.toLocaleString()}
          unit="次"
          icon={<AnalysisIcon />}
          sparkData={data.daily_usage.map((d) => d.call_count)}
          color="#3B82F6"
        />
        <StatCard
          label="累计分析股票数"
          value={(data.total_calls * 5).toLocaleString()}
          unit="只"
          icon={<StockIcon />}
          sparkData={data.daily_usage.map((d) => d.call_count * 5)}
          color="#8B5CF6"
        />
        <StatCard
          label="累计 Token"
          value={data.cumulative_total_tokens.toLocaleString()}
          icon={<TokenIcon />}
          sparkData={data.daily_usage.map((d) => d.total_tokens)}
          color="#F59E0B"
        />
        <StatCard
          label="累计花费"
          value={`¥${data.cumulative_cost_rmb.toFixed(2)}`}
          icon={<CostIcon />}
          sparkData={data.daily_usage.map((d) => d.cost_rmb)}
          color="#10B981"
        />
      </div>

      {/* Main Content: Trend Chart */}
      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-(--color-text-primary)">Token 使用趋势（最近30天）</h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-(--color-accent)" />
              <span className="text-(--color-text-secondary)">Token 数量</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#10B981]" />
              <span className="text-(--color-text-secondary)">花费（元）</span>
            </span>
          </div>
        </div>

        <div className="mt-4">
          <TrendChart data={last30} />
        </div>

        {/* Daily Stats */}
        <div className="mt-6 grid grid-cols-4 gap-4 border-t border-(--color-border-light) pt-4">
          <DailyStat label="平均每日 Token" value={avgDailyTokens.toLocaleString()} />
          <DailyStat label="平均每日花费" value={`¥${avgDailyCost.toFixed(2)}`} />
          <DailyStat
            label="单日最高 Token"
            value={maxDayTokens ? maxDayTokens.total_tokens.toLocaleString() : "0"}
            sub={maxDayTokens?.date}
          />
          <DailyStat
            label="单日最高花费"
            value={maxDayCost ? `¥${maxDayCost.cost_rmb.toFixed(2)}` : "¥0"}
            sub={maxDayCost?.date}
          />
        </div>
      </div>

      {/* Bottom: Daily Table */}
      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
        <div className="flex items-center justify-between border-b border-(--color-border-light) px-6 py-4">
          <h2 className="text-base font-bold text-(--color-text-primary)">费用统计明细</h2>
          <button className="text-xs font-medium text-(--color-accent) transition-colors hover:text-blue-700">
            查看全部 →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border-light) text-left">
                <th className="px-6 py-3 text-xs font-medium text-(--color-text-secondary)">日期</th>
                <th className="px-6 py-3 text-xs font-medium text-(--color-text-secondary)">模型</th>
                <th className="px-6 py-3 text-xs font-medium text-(--color-text-secondary)">分析股票数</th>
                <th className="px-6 py-3 text-xs font-medium text-(--color-text-secondary)">Token 使用</th>
                <th className="px-6 py-3 text-xs font-medium text-(--color-text-secondary)">费用（元）</th>
              </tr>
            </thead>
            <tbody>
              {pagedDaily.map((d) => (
                <tr key={d.date} className="border-b border-[#F8FAFC] transition-colors hover:bg-(--color-bg-main)">
                  <td className="px-6 py-3.5 font-medium text-(--color-text-primary)">{d.date}</td>
                  <td className="px-6 py-3.5 text-(--color-text-secondary)">{data.model}</td>
                  <td className="px-6 py-3.5 text-(--color-text-secondary)">{d.call_count * 5}</td>
                  <td className="px-6 py-3.5 font-medium text-(--color-text-primary)">{d.total_tokens.toLocaleString()}</td>
                  <td className="px-6 py-3.5 font-medium text-(--color-text-primary)">¥{d.cost_rmb.toFixed(4)}</td>
                </tr>
              ))}
              {pagedDaily.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-(--color-text-tertiary)">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-(--color-border-light) px-6 py-3">
          <span className="text-xs text-(--color-text-secondary)">共 {data.daily_usage.length} 条</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded px-2 py-1 text-xs text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-hover) disabled:opacity-40"
            >
              &lt;
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    page === pageNum
                      ? "bg-(--color-accent) text-white"
                      : "text-(--color-text-secondary) hover:bg-(--color-bg-hover)"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="rounded px-2 py-1 text-xs text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-hover) disabled:opacity-40"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({
  label,
  value,
  unit,
  icon,
  sparkData,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  sparkData: number[];
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}10` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
        <div className="h-8 w-16">
          <MiniSparkline data={sparkData} color={color} />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-(--color-text-secondary)">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-(--color-text-primary)">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-(--color-text-tertiary)">{unit}</span>}
      </p>
    </div>
  );
}

/* ─── Daily Stat ─── */
function DailyStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-(--color-text-secondary)">{label}</p>
      <p className="mt-1 text-base font-bold text-(--color-text-primary)">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-(--color-text-tertiary)">{sub}</p>}
    </div>
  );
}

/* ─── SVG Icons ─── */
function AnalysisIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 14 7 9 11 12 17 4" />
      <polyline points="13 4 17 4 17 8" />
    </svg>
  );
}

function StockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 10l2 2 4-4" />
    </svg>
  );
}

function TokenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v16M6 6l4-4 4 4M6 14l4 4 4-4" />
    </svg>
  );
}

function CostIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 5v10M8 7.5c0-.83.9-1.5 2-1.5s2 .67 2 1.5c0 1.5-2 1.5-2 2.5M8 12.5c0 .83.9 1.5 2 1.5s2-.67 2-1.5" />
    </svg>
  );
}

/* ─── Mini Sparkline ─── */
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 32;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2);
    const y = padding + (1 - (v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline
        points={points.join(" ")}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  );
}

/* ─── Trend Chart (Dual Axis) ─── */
function TrendChart({ data }: { data: DailyUsage[] }) {
  if (data.length === 0) return <div className="h-48" />;

  const maxTokens = Math.max(...data.map((d) => d.total_tokens));
  const maxCost = Math.max(...data.map((d) => d.cost_rmb));

  const chartW = 720;
  const chartH = 220;
  const padL = 48;
  const padR = 48;
  const padT = 16;
  const padB = 32;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const tokenPoints = data.map((d, i) => {
    const x = padL + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = padT + (1 - d.total_tokens / (maxTokens || 1)) * innerH;
    return `${x},${y}`;
  });

  const costPoints = data.map((d, i) => {
    const x = padL + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = padT + (1 - d.cost_rmb / (maxCost || 1)) * innerH;
    return `${x},${y}`;
  });

  const tokenArea = `${padL},${padT + innerH} ${tokenPoints.join(" ")} ${padL + innerW},${padT + innerH}`;

  const tokenYTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: padT + (1 - pct) * innerH,
    value: Math.round(maxTokens * pct),
  }));

  const costYTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: padT + (1 - pct) * innerH,
    value: maxCost < 1 ? (maxCost * pct).toFixed(2) : (maxCost * pct).toFixed(1),
  }));

  const xStep = Math.max(1, Math.floor(data.length / 5));
  const xLabels = data.filter((_, i) => i % xStep === 0 || i === data.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet">
      {tokenYTicks.map((t, i) => (
        <line key={i} x1={padL} y1={t.y} x2={chartW - padR} y2={t.y} stroke="#F1F5F9" strokeWidth="1" />
      ))}

      <polygon points={tokenArea} fill="url(#tokenGrad)" opacity="0.15" />
      <polyline points={tokenPoints.join(" ")} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={costPoints.join(" ")} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {data.map((d, i) => {
        const x = padL + (i / Math.max(data.length - 1, 1)) * innerW;
        const y = padT + (1 - d.total_tokens / (maxTokens || 1)) * innerH;
        return <circle key={i} cx={x} cy={y} r="3" fill="#3B82F6" />;
      })}

      {data.map((d, i) => {
        const x = padL + (i / Math.max(data.length - 1, 1)) * innerW;
        const y = padT + (1 - d.cost_rmb / (maxCost || 1)) * innerH;
        return <circle key={i} cx={x} cy={y} r="3" fill="#10B981" />;
      })}

      {tokenYTicks.map((t, i) => (
        <text key={i} x={padL - 8} y={t.y + 4} textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="system-ui">
          {t.value >= 1000 ? `${(t.value / 1000).toFixed(0)}K` : t.value}
        </text>
      ))}

      {costYTicks.map((t, i) => (
        <text key={i} x={chartW - padR + 8} y={t.y + 4} textAnchor="start" fill="#94A3B8" fontSize="10" fontFamily="system-ui">
          {t.value}
        </text>
      ))}

      {xLabels.map((d, i) => {
        const idx = data.indexOf(d);
        const x = padL + (idx / Math.max(data.length - 1, 1)) * innerW;
        return (
          <text key={i} x={x} y={chartH - 4} textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="system-ui">
            {d.date.slice(5)}
          </text>
        );
      })}

      <defs>
        <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
