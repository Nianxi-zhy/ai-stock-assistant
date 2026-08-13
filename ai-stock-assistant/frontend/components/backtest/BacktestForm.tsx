"use client";

import { STOCK_PRESETS, PERIOD_OPTIONS, type StrategyOption } from "./types";

interface BacktestFormProps {
  code: string;
  setCode: (value: string) => void;
  strategy: string;
  setStrategy: (value: string) => void;
  days: number;
  setDays: (value: number) => void;
  initialCash: string;
  setInitialCash: (value: string) => void;
  strategies: StrategyOption[];
  loading: boolean;
  onRunBacktest: () => void;
}

export default function BacktestForm({
  code,
  setCode,
  strategy,
  setStrategy,
  days,
  setDays,
  initialCash,
  setInitialCash,
  strategies,
  loading,
  onRunBacktest,
}: BacktestFormProps) {
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
      <div>
        <label className="block text-xs font-medium text-(--color-text-secondary) mb-1">股票</label>
        <div className="flex gap-1">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-24 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
            placeholder="代码"
          />
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-lg border border-(--color-border) px-2 py-2 text-xs outline-none focus:border-(--color-accent)"
          >
            {STOCK_PRESETS.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-(--color-text-secondary) mb-1">策略</label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          className="rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        >
          {strategies.map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-(--color-text-secondary) mb-1">回测天数</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        >
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-(--color-text-secondary) mb-1">初始资金</label>
        <input
          type="number"
          min={10000}
          step={10000}
          value={initialCash}
          onChange={(e) => setInitialCash(e.target.value)}
          className="w-28 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        />
      </div>
      <button
        onClick={onRunBacktest}
        disabled={loading}
        className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "回测中..." : "开始回测"}
      </button>
    </div>
  );
}
