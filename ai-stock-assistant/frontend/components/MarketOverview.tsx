"use client";

import { CandlestickChart } from "lucide-react";
import { GLASS_CARD } from "@/lib/glass";
import type { MarketEnvironmentResponse } from "@/lib/api";

export default function MarketOverview({ env }: { env: MarketEnvironmentResponse | null }) {
  if (!env) return null;

  return (
    <div className={GLASS_CARD}>
      <div className="flex items-center gap-2.5 border-b border-(--color-border) px-5 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-accent-light) text-(--color-accent)">
          <CandlestickChart size={16} />
        </span>
        <h2 className="text-base font-bold text-(--color-text-primary)">市场概览</h2>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-(--color-accent-light) px-2 py-0.5 text-[10px] font-semibold text-(--color-accent)">
          评分 {env.score}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-[color-mix(in_srgb,var(--color-bg-hover)_70%,transparent)]">
        {env.indices.map((idx) => (
          <div key={idx.code} className="bg-[color-mix(in_srgb,var(--color-bg-card)_50%,transparent)] px-5 py-3.5 backdrop-blur-md">
            <div className="text-[11px] font-medium text-(--color-text-secondary)">{idx.name}</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-(--color-text-primary)">{idx.price.toFixed(2)}</div>
            <div className={`text-xs font-medium tabular-nums ${idx.change_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
              {idx.change_pct >= 0 ? "+" : ""}{idx.change_pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
