"use client";

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface IndicatorData {
  date: string;
  macd_dif?: number | null;
  macd_dea?: number | null;
  macd_hist?: number | null;
  rsi?: number | null;
  boll_upper?: number | null;
  boll_mid?: number | null;
  boll_lower?: number | null;
}

export function MacdChart({ data }: { data: IndicatorData[] }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
      <div className="mb-2 text-xs font-bold text-(--color-text-primary)">MACD</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data as any} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} hide />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="macd_hist" fill="#3B82F6" />
          <Line type="monotone" dataKey="macd_dif" stroke="#3B82F6" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="macd_dea" stroke="#F59E0B" dot={false} strokeWidth={1.5} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RsiChart({ data }: { data: IndicatorData[] }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
      <div className="mb-2 text-xs font-bold text-(--color-text-primary)">RSI (14)</div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data as any} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} hide />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="rsi" stroke="#8B5CF6" dot={false} strokeWidth={1.5} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BollChart({ data }: { data: IndicatorData[] }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
      <div className="mb-2 text-xs font-bold text-(--color-text-primary)">布林带 (BOLL)</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data as any} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} hide />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="boll_upper" stroke="#EF4444" dot={false} strokeWidth={1} strokeDasharray="3 3" connectNulls />
          <Line type="monotone" dataKey="boll_mid" stroke="#F59E0B" dot={false} strokeWidth={1.5} connectNulls />
          <Line type="monotone" dataKey="boll_lower" stroke="#22C55E" dot={false} strokeWidth={1} strokeDasharray="3 3" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
