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

  const displayDate = reportDate
    ? reportDate
    : new Date().toISOString().slice(0, 10);

  return (
    <header className="flex h-16 items-center justify-between border-b border-(--color-border) bg-(--color-bg-card) px-5">
      {/* Left */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-(--color-text-primary)">
          今日概览
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-bg-raised) px-3 py-1 text-xs font-semibold text-(--color-text-secondary)">
          <span>✨</span>
          {displayDate}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Price filter */}
        <div className="flex items-center gap-2 rounded-2xl border border-(--color-border) bg-(--color-bg-raised) px-3 py-1.5">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-(--color-border) text-(--color-accent)"
            />
            <span className="text-xs font-semibold text-(--color-text-secondary)">价格</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={enabled ? minPrice : 0}
            disabled={!enabled}
            onChange={(e) => setMinPrice(Number(e.target.value))}
            className="w-10 rounded-lg border-0 bg-transparent p-0 text-center text-xs font-mono font-bold text-(--color-text-primary) outline-none focus:ring-0 disabled:opacity-30"
          />
          <span className="text-xs text-(--color-text-tertiary)">—</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={enabled ? maxPrice : 9999}
            disabled={!enabled}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-10 rounded-lg border-0 bg-transparent p-0 text-center text-xs font-mono font-bold text-(--color-text-primary) outline-none focus:ring-0 disabled:opacity-30"
          />
          <span className="text-xs text-(--color-text-tertiary)">元</span>
        </div>

        <button
          onClick={() => onAnalyze?.(minPrice, maxPrice)}
          disabled={loading}
          className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          <span>✨</span>
          {loading ? "分析中…" : "推荐"}
        </button>

        <div className="h-5 w-px bg-(--color-border)" />

        {onSearchStock && <StockSearch onSelect={onSearchStock} />}

        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新数据"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--color-border) bg-(--color-bg-card) text-(--color-text-secondary) transition-all hover:scale-105 hover:bg-(--color-bg-raised) hover:text-(--color-text-primary) disabled:opacity-50"
        >
          <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </header>
  );
}
