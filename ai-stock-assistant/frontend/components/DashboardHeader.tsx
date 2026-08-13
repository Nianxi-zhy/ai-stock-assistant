"use client";

import { useState } from "react";
import type { FilterSettings } from "@/lib/api";
import StockSearch from "./StockSearch";

export default function DashboardHeader({
  reportDate,
  loading,
  onRefresh,
  filterSettings,
  onAnalyze,
  onSearchStock,
}: {
  reportDate?: string;
  loading: boolean;
  onRefresh: () => void;
  filterSettings?: FilterSettings | null;
  onAnalyze?: (min: number, max: number) => void;
  onSearchStock?: (code: string, name: string) => void;
}) {
  const [minPrice, setMinPrice] = useState(filterSettings?.min_stock_price ?? 2);
  const [maxPrice, setMaxPrice] = useState(filterSettings?.max_stock_price ?? 30);
  const [enabled, setEnabled] = useState(filterSettings?.low_price_mode ?? true);

  return (
    <header className="flex h-14 items-center justify-between border-b border-(--color-border) bg-(--color-bg-card) px-8">
      {/* Left */}
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold text-(--color-text-primary)">今日概览</h1>
        <span className="text-xs text-(--color-text-tertiary)">·</span>
        <span className="text-xs text-(--color-text-secondary)">{reportDate || "加载中..."}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Price filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-raised) px-2.5 py-1.5">
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-(--color-accent) focus:ring-[#3B82F6]/30"
            />
            <span className="text-[11px] font-medium text-(--color-text-secondary)">价格</span>
          </label>
          <span className="text-[10px] text-[#D1D5DB]">|</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={enabled ? minPrice : 0}
            disabled={!enabled}
            onChange={(e) => setMinPrice(Number(e.target.value))}
            className="w-12 rounded border-0 bg-transparent p-0 text-xs font-mono font-semibold text-(--color-text-primary) outline-none focus:ring-0 disabled:opacity-30"
          />
          <span className="text-[10px] text-(--color-text-tertiary)">—</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={enabled ? maxPrice : 9999}
            disabled={!enabled}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-12 rounded border-0 bg-transparent p-0 text-xs font-mono font-semibold text-(--color-text-primary) outline-none focus:ring-0 disabled:opacity-30"
          />
          <span className="text-[10px] text-(--color-text-tertiary)">元</span>
        </div>

        <button
          onClick={() => onAnalyze?.(minPrice, maxPrice)}
          disabled={loading}
          className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "分析中…" : "推荐"}
        </button>

        <div className="h-5 w-px bg-[#E5E7EB]" />

        {onSearchStock && <StockSearch onSelect={onSearchStock} />}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-(--color-border) bg-(--color-bg-card) p-1.5 text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-raised) hover:text-(--color-text-primary) disabled:opacity-50"
        >
          <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </header>
  );
}
