"use client";

import type { ScanResponse, ResearchResponse, BatchScanResponse } from "@/lib/api";
import { PERIOD_OPTIONS, type StrategyOption } from "./types";

interface BacktestParamsProps {
  code: string;
  strategies: StrategyOption[];
  scanStrategy: string;
  setScanStrategy: (value: string) => void;
  scanDays: number;
  setScanDays: (value: number) => void;
  trainRatio: string;
  setTrainRatio: (value: string) => void;
  scanCodes: string;
  setScanCodes: (value: string) => void;
  scanJson: string;
  setScanJson: (value: string) => void;
  scanLoading: boolean;
  researchLoading: boolean;
  onScan: () => void;
  onResearch: () => void;
  scanError: string;
  scanResult: ScanResponse | null;
  researchResult: ResearchResponse | null;
  batchResult: BatchScanResponse | null;
  batchError: string;
}

export default function BacktestParams({
  code,
  strategies,
  scanStrategy,
  setScanStrategy,
  scanDays,
  setScanDays,
  trainRatio,
  setTrainRatio,
  scanCodes,
  setScanCodes,
  scanJson,
  setScanJson,
  scanLoading,
  researchLoading,
  onScan,
  onResearch,
  scanError,
  scanResult,
  researchResult,
  batchResult,
  batchError,
}: BacktestParamsProps) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-(--color-text-primary)">批量扫描与研究</h3>
        <span className="text-xs text-(--color-text-tertiary)">对 {code} · {strategies.find((s) => s.key === scanStrategy)?.name ?? scanStrategy} 批量参数寻优与过拟合检验</span>
      </div>

      <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">策略</label>
            <select
              value={scanStrategy}
              onChange={(e) => setScanStrategy(e.target.value)}
              className="rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
            >
              {strategies.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">回测天数</label>
            <select
              value={scanDays}
              onChange={(e) => setScanDays(Number(e.target.value))}
              className="rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">训练占比（0.5-0.9）</label>
            <input
              type="number"
              min={0.5}
              max={0.9}
              step={0.05}
              value={trainRatio}
              onChange={(e) => setTrainRatio(e.target.value)}
              className="w-24 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-secondary)">股票代码（每行一个，留空=只用上方股票）</label>
            <textarea
              value={scanCodes}
              onChange={(e) => setScanCodes(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={"留空=单股扫描\n600519\n000858"}
              className="w-48 rounded-lg border border-(--color-border) bg-(--color-bg-raised) px-3 py-2 font-mono text-xs text-(--color-text-primary) outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-(--color-text-secondary) mb-1">参数扫描 JSON</label>
          <textarea
            value={scanJson}
            onChange={(e) => setScanJson(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={'{"fast_ma":[5,10,15,20],"slow_ma":[20,40,60]}'}
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-raised) px-3 py-2 font-mono text-xs text-(--color-text-primary) outline-none focus:border-(--color-accent)"
          />
          <p className="mt-1 text-[11px] text-(--color-text-tertiary)">
            参数名需与策略在后端使用的参数名一致。执行扫描时每个参数取数组内全部值做笛卡尔积；训练/验证研究取每组的中位值为基准参数。
          </p>
        </div>

        <div className="mt-3 flex gap-3">
          <button
            onClick={onScan}
            disabled={scanLoading || researchLoading}
            className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {scanLoading ? "扫描中..." : "执行扫描"}
          </button>
          <button
            onClick={onResearch}
            disabled={researchLoading || scanLoading}
            className="rounded-lg border border-(--color-accent) px-5 py-2 text-sm font-semibold text-(--color-accent) transition-colors hover:bg-(--color-accent-light) disabled:opacity-50"
          >
            {researchLoading ? "研究中..." : "训练 / 验证研究"}
          </button>
        </div>
      </div>

      {scanError && <p className="mt-3 text-sm text-red-500">{scanError}</p>}

      {scanResult && (
        <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
          <div className="border-b border-(--color-border) px-5 py-3">
            <h4 className="text-sm font-bold text-(--color-text-primary)">
              扫描结果
              <span className="ml-2 text-xs font-normal text-(--color-text-tertiary)">
                共评估 {scanResult.combos_evaluated} 组组合
                {scanResult.truncated && " · 结果过多已截断"}
              </span>
            </h4>
            {scanResult.warning && (
              <p className="mt-1 text-[11px] text-amber-600">{scanResult.warning}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-(--color-border-light)">
                  <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">参数</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">收益</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">买入持有</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">胜率</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">最大回撤</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">交易数</th>
                </tr>
              </thead>
              <tbody>
                {scanResult.results.map((r, i) => (
                  <tr key={i} className="border-b border-[#F9FAFB] last:border-b-0">
                    <td className="px-5 py-2.5 font-mono text-(--color-text-secondary)">{JSON.stringify(r.params)}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${r.total_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                      {r.total_pnl_pct >= 0 ? "+" : ""}{r.total_pnl_pct}%
                    </td>
                    <td className={`px-5 py-2.5 text-right ${r.benchmark_return_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                      {r.benchmark_return_pct >= 0 ? "+" : ""}{r.benchmark_return_pct}%
                    </td>
                    <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{r.win_rate}%</td>
                    <td className="px-5 py-2.5 text-right text-red-500">{r.max_drawdown_pct}%</td>
                    <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{r.total_trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {researchResult && (
        <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
          <div className="border-b border-(--color-border) px-5 py-3">
            <h4 className="text-sm font-bold text-(--color-text-primary)">
              研究成果 Top {researchResult.top.length}
              <span className="ml-2 text-xs font-normal text-(--color-text-tertiary)">
                训练占比 {Math.round(researchResult.train_ratio * 100)}% · 训练截至 {researchResult.split_end} · 验证自 {researchResult.val_start}
              </span>
            </h4>
            <p className="mt-1 text-[11px] text-(--color-text-tertiary)">
              对比训练期与验证期收益：验证收益显著低于训练收益（差距 ≥ 10pp）说明参数过拟合。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-(--color-border-light)">
                  <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">参数</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">训练收益</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">训练胜率</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">验证收益</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">验证胜率</th>
                  <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">训练/验证回撤</th>
                  <th className="px-5 py-2.5 text-center font-semibold text-(--color-text-secondary)">结论</th>
                </tr>
              </thead>
              <tbody>
                {researchResult.top.map((c, i) => {
                  const gap = c.train_pnl_pct - c.val_pnl_pct;
                  const overfit = gap > 10;
                  return (
                    <tr key={i} className="border-b border-[#F9FAFB] last:border-b-0">
                      <td className="px-5 py-2.5 font-mono text-(--color-text-secondary)">{JSON.stringify(c.param)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-red-500">
                        {(c.train_pnl_pct >= 0 ? "+" : "")}{c.train_pnl_pct}%
                      </td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{c.train_win_rate}%</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${c.val_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {(c.val_pnl_pct >= 0 ? "+" : "")}{c.val_pnl_pct}%
                      </td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{c.val_win_rate}%</td>
                      <td className="px-5 py-2.5 text-right text-red-500">{c.train_drawdown}% / {c.val_drawdown}%</td>
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
      )}

      {batchError && <p className="mt-3 text-sm text-red-500">{batchError}</p>}

      {batchResult && (
        <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <h4 className="text-sm font-bold text-(--color-text-primary)">多股票批量扫描结果</h4>
          <p className="mt-0.5 text-[11px] text-(--color-text-tertiary)">
            每只股票独立寻优，再跨股票聚合出通用参数集（Top 参数按正收益股票数与平均收益排序）。
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {batchResult.codes.map((c) => (
              <div key={c.code} className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-(--color-text-primary)">{c.name || c.code}</span>
                  <span className="text-[11px] text-(--color-text-tertiary)">{c.code} · 评估 {c.combos_evaluated} 组</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-lg font-bold ${c.best_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {c.best_pnl_pct >= 0 ? "+" : ""}{c.best_pnl_pct}%
                  </span>
                  <span className="text-[11px] text-(--color-text-tertiary)">最优收益 · 胜率 {c.best_win_rate}%</span>
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-(--color-text-secondary)">
                  {JSON.stringify(c.best_params)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="border-b border-(--color-border) pb-2">
              <h4 className="text-sm font-bold text-(--color-text-primary)">
                跨股票 Top 参数集
                <span className="ml-2 text-xs font-normal text-(--color-text-tertiary)">
                  {batchResult.top_param_sets.length} 组 · 共 {batchResult.total_runs} 次回测
                </span>
              </h4>
              {batchResult.warning && (
                <p className="mt-1 text-[11px] text-amber-600">{batchResult.warning}</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-(--color-border-light)">
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">参数</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">正收益股票数</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">平均收益</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">覆盖股票数</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResult.top_param_sets.map((t, i) => (
                    <tr key={i} className="border-b border-[#F9FAFB] last:border-b-0">
                      <td className="px-5 py-2.5 font-mono text-(--color-text-secondary)">{t.param_key}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-red-500">{t.positive_stocks}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${t.avg_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {t.avg_pnl_pct >= 0 ? "+" : ""}{t.avg_pnl_pct}%
                      </td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{t.stocks_covered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
