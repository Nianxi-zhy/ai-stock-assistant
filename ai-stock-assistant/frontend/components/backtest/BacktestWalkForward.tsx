"use client";

import type { WalkForwardResponse } from "@/lib/api";
import { STOCK_PRESETS, PERIOD_OPTIONS, type StrategyOption } from "./types";

interface BacktestWalkForwardProps {
  strategies: StrategyOption[];
  wfCode: string;
  setWfCode: (value: string) => void;
  wfStrategy: string;
  setWfStrategy: (value: string) => void;
  wfDays: number;
  setWfDays: (value: number) => void;
  wfWindow: number;
  setWfWindow: (value: number) => void;
  wfStep: number;
  setWfStep: (value: number) => void;
  wfTopN: number;
  setWfTopN: (value: number) => void;
  wfJson: string;
  setWfJson: (value: string) => void;
  wfLoading: boolean;
  onRun: () => void;
  wfError: string;
  wfResult: WalkForwardResponse | null;
}

export default function BacktestWalkForward({
  strategies,
  wfCode,
  setWfCode,
  wfStrategy,
  setWfStrategy,
  wfDays,
  setWfDays,
  wfWindow,
  setWfWindow,
  wfStep,
  setWfStep,
  wfTopN,
  setWfTopN,
  wfJson,
  setWfJson,
  wfLoading,
  onRun,
  wfError,
  wfResult,
}: BacktestWalkForwardProps) {
  return (
    <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
      <h4 className="text-sm font-bold text-(--color-text-primary)">滚动重训（Walk-Forward）</h4>
      <p className="mt-0.5 text-[11px] text-(--color-text-tertiary)">
        滚动窗口训练 / 验证，检验策略参数的时间稳定性：验证收益显著低于训练收益（差距 ≥ 10pp）说明参数过拟合。
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">股票</label>
          <div className="flex gap-1">
            <input
              value={wfCode}
              onChange={(e) => setWfCode(e.target.value)}
              className="w-24 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
              placeholder="代码"
            />
            <select
              value={wfCode}
              onChange={(e) => setWfCode(e.target.value)}
              className="rounded-lg border border-(--color-border) px-2 py-2 text-xs outline-none focus:border-(--color-accent)"
            >
              {STOCK_PRESETS.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">策略</label>
          <select
            value={wfStrategy}
            onChange={(e) => setWfStrategy(e.target.value)}
            className="rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
          >
            {strategies.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">总天数</label>
          <select
            value={wfDays}
            onChange={(e) => setWfDays(Number(e.target.value))}
            className="rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">窗口天数</label>
          <input
            type="number"
            min={30}
            step={10}
            value={wfWindow}
            onChange={(e) => setWfWindow(Number(e.target.value))}
            className="w-24 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">步长天数</label>
          <input
            type="number"
            min={5}
            step={5}
            value={wfStep}
            onChange={(e) => setWfStep(Number(e.target.value))}
            className="w-24 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">Top N</label>
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={wfTopN}
            onChange={(e) => setWfTopN(Number(e.target.value))}
            className="w-20 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium text-(--color-text-secondary) mb-1">参数网格 JSON</label>
        <textarea
          value={wfJson}
          onChange={(e) => setWfJson(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={'{"fast_ma":[5,10,20],"slow_ma":[20,40,60]}'}
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-raised) px-3 py-2 font-mono text-xs text-(--color-text-primary) outline-none focus:border-(--color-accent)"
        />
        <p className="mt-1 text-[11px] text-(--color-text-tertiary)">
          每个窗口用训练段寻优选出 Top N 参数，再在验证段检验；最终一致性 = 盈利窗口占比。
        </p>
      </div>

      <div className="mt-3">
        <button
          onClick={onRun}
          disabled={wfLoading}
          className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {wfLoading ? "滚动研究中..." : "滚动研究"}
        </button>
      </div>

      {wfError && <p className="mt-3 text-sm text-red-500">{wfError}</p>}

      {wfResult && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">窗口总数</div>
              <div className="mt-1 text-lg font-bold text-(--color-text-primary)">{wfResult.summary.windows_total}</div>
              <div className="text-xs text-(--color-text-tertiary)">滚动窗口</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">盈利窗口</div>
              <div className={`mt-1 text-lg font-bold ${wfResult.summary.windows_profitable > 0 ? "text-red-500" : "text-green-600"}`}>
                {wfResult.summary.windows_profitable}
              </div>
              <div className="text-xs text-(--color-text-tertiary)">验证期正收益</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">一致性</div>
              <div className="mt-1 text-lg font-bold text-(--color-text-primary)">{wfResult.summary.consistency_pct}%</div>
              <div className="text-xs text-(--color-text-tertiary)">盈利窗口占比</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">平均验证收益</div>
              <div className={`mt-1 text-lg font-bold ${wfResult.summary.avg_val_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                {wfResult.summary.avg_val_pnl_pct >= 0 ? "+" : ""}{wfResult.summary.avg_val_pnl_pct}%
              </div>
              <div className="text-xs text-(--color-text-tertiary)">跨窗口平均</div>
            </div>
          </div>

          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
            <div className="border-b border-(--color-border) px-5 py-3">
              <h4 className="text-sm font-bold text-(--color-text-primary)">
                各窗口明细
                <span className="ml-2 text-xs font-normal text-(--color-text-tertiary)">
                  窗口 {wfResult.window_days} 天 · 步长 {wfResult.step_days} 天
                </span>
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-(--color-border-light)">
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">窗口</th>
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">训练区间</th>
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">验证区间</th>
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">最优参数</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">训练收益</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">训练胜率</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">验证收益</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">验证胜率</th>
                    <th className="px-5 py-2.5 text-center font-semibold text-(--color-text-secondary)">结论</th>
                  </tr>
                </thead>
                <tbody>
                  {wfResult.windows.map((w) => {
                    const gap = w.train_pnl_pct - w.val_pnl_pct;
                    const overfit = gap > 10;
                    return (
                      <tr key={w.window_idx} className="border-b border-[#F9FAFB] last:border-b-0">
                        <td className="px-5 py-2.5 text-(--color-text-primary)">#{w.window_idx + 1}</td>
                        <td className="px-5 py-2.5 text-(--color-text-secondary)">{w.train_start} ~ {w.train_end}</td>
                        <td className="px-5 py-2.5 text-(--color-text-secondary)">{w.val_start} ~ {w.val_end}</td>
                        <td className="px-5 py-2.5 font-mono text-(--color-text-secondary)">{JSON.stringify(w.best_params)}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-red-500">
                          {(w.train_pnl_pct >= 0 ? "+" : "")}{w.train_pnl_pct}%
                        </td>
                        <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{w.train_win_rate}%</td>
                        <td className={`px-5 py-2.5 text-right font-semibold ${w.val_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                          {(w.val_pnl_pct >= 0 ? "+" : "")}{w.val_pnl_pct}%
                        </td>
                        <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{w.val_win_rate}%</td>
                        <td className="px-5 py-2.5 text-center">
                          {overfit ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-500">
                              过拟合 ({gap.toFixed(1)}pp)
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-600">
                              稳健
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
