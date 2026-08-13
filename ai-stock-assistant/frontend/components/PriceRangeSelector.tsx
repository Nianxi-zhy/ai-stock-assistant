"use client";

import { useState } from "react";
import type { FilterSettings } from "@/lib/api";

interface PriceRangeSelectorProps {
  filterSettings: FilterSettings;
  loading: boolean;
  onAnalyze: (min: number, max: number) => void;
}

export default function PriceRangeSelector({
  filterSettings,
  loading,
  onAnalyze,
}: PriceRangeSelectorProps) {
  const [minPrice, setMinPrice] = useState(filterSettings.min_stock_price);
  const [maxPrice, setMaxPrice] = useState(filterSettings.max_stock_price);
  const [enabled, setEnabled] = useState(filterSettings.low_price_mode);

  const handleAnalyze = () => {
    onAnalyze(minPrice, maxPrice);
  };

  return (
    <div className="border-b border-(--color-border) bg-(--color-bg-main)">
      <div className="mx-auto max-w-5xl px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">

          {/* Toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 px-2 py-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-(--color-border) bg-(--color-bg-card) text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0"
            />
            <span className="whitespace-nowrap text-xs font-medium tracking-wide text-(--color-text-secondary) uppercase">
              价格筛选
            </span>
          </label>

          {/* Price inputs */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-md border border-(--color-border) bg-(--color-bg-raised) px-2 py-1">
              <span className="text-[10px] font-medium text-(--color-text-tertiary)">最低</span>
              <input
                type="number"
                min={0}
                max={9999}
                step={0.5}
                value={enabled ? minPrice : 0}
                disabled={!enabled}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="w-14 border-0 bg-transparent p-0 text-xs font-mono font-semibold text-(--color-text-primary) outline-none focus:ring-0 disabled:opacity-30"
              />
            </div>
            <span className="text-xs text-(--color-text-tertiary)">—</span>
            <div className="flex items-center gap-1 rounded-md border border-(--color-border) bg-(--color-bg-raised) px-2 py-1">
              <span className="text-[10px] font-medium text-(--color-text-tertiary)">最高</span>
              <input
                type="number"
                min={0}
                max={9999}
                step={0.5}
                value={enabled ? maxPrice : 9999}
                disabled={!enabled}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-14 border-0 bg-transparent p-0 text-xs font-mono font-semibold text-(--color-text-primary) outline-none focus:ring-0 disabled:opacity-30"
              />
            </div>
            <span className="text-[10px] text-(--color-text-tertiary)">元</span>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                分析中
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新分析
              </>
            )}
          </button>

          {/* Price range summary */}
          {!loading && (
            <span className="text-[10px] font-mono text-(--color-text-tertiary)">
              ¥{minPrice} – {enabled ? `¥${maxPrice}` : "不限"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
