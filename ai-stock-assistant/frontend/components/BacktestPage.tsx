"use client";

import { useState, useEffect, useCallback } from "react";
import BacktestChart from "./BacktestChart";
import type { ScanResponse, ResearchResponse, BatchScanResponse, WalkForwardResponse } from "@/lib/api";
import { scanBacktests, researchBacktest, batchScan, walkForward } from "@/lib/api";

const API_BASE = "http://localhost:8000/api/v1";

interface BacktestTrade {
  date: string;
  type: string;
  price: number;
  shares?: number;
  cost?: number;
  revenue?: number;
  pnl?: number;
  pnl_pct?: number;
  cash_after: number;
}

interface KlineBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Signal {
  date: string;
  type: "buy" | "sell";
  price: number;
}

interface EquityPoint {
  date: string;
  value: number;
}

interface BenchmarkData {
  initial_investment: number;
  shares_bought: number;
  avg_cost: number;
  final_value: number;
  total_return_pct: number;
}

interface StrategyOption {
  key: string;
  name: string;
}

interface BacktestResult {
  code: string;
  strategy: string;
  strategy_key: string;
  period_days: number;
  initial_cash: number;
  final_cash: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_trades: number;
  win_trades: number;
  loss_trades: number;
  win_rate: number;
  max_drawdown_pct: number;
  trades: BacktestTrade[];
  kline: KlineBar[];
  signals: Signal[];
  equity_curve: EquityPoint[];
  benchmark: BenchmarkData;
  strategies_available: StrategyOption[];
}

const STOCK_PRESETS = [
  { code: "600519", name: "贵州茅台" },
  { code: "000858", name: "五粮液" },
  { code: "600036", name: "招商银行" },
  { code: "601318", name: "中国平安" },
  { code: "300750", name: "宁德时代" },
];

const PERIOD_OPTIONS = [
  { value: 90, label: "90 天" },
  { value: 180, label: "180 天" },
  { value: 365, label: "1 年" },
  { value: 730, label: "2 年" },
];

const DEFAULT_STRATEGIES: StrategyOption[] = [
  { key: "macd_cross", name: "MACD 金叉死叉" },
  { key: "multi_indicator", name: "多指标共振" },
  { key: "boll_breakout", name: "布林带突破" },
  { key: "ma_trend", name: "均线趋势跟踪" },
];

const DEFAULT_SCAN_JSON = JSON.stringify(
  { fast_ma: [5, 10, 15, 20], slow_ma: [20, 40, 60] },
  null,
  2
);

interface BacktestRunRecord {
  id: number;
  code: string;
  name: string;
  strategy_key: string;
  strategy_name: string;
  days: number;
  initial_cash: number;
  final_cash: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_trades: number;
  win_trades: number;
  loss_trades: number;
  win_rate: number;
  max_drawdown_pct: number;
  benchmark_return_pct: number;
  created_at: string;
}

interface StrategyStat {
  strategy_key: string;
  strategy_name: string;
  run_count: number;
  avg_pnl_pct: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
  profitable_runs: number;
}

interface BacktestRunsResponse {
  runs: BacktestRunRecord[];
  strategy_stats: StrategyStat[];
  total_runs: number;
}

export default function BacktestPage() {
  const [code, setCode] = useState("000858");
  const [strategy, setStrategy] = useState("macd_cross");
  const [days, setDays] = useState(365);
  const [initialCash, setInitialCash] = useState("100000");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<BacktestRunsResponse | null>(null);
  const [scanStrategy, setScanStrategy] = useState("macd_cross");
  const [scanDays, setScanDays] = useState(365);
  const [trainRatio, setTrainRatio] = useState("0.75");
  const [scanJson, setScanJson] = useState(DEFAULT_SCAN_JSON);
  const [scanCodes, setScanCodes] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [researchResult, setResearchResult] = useState<ResearchResponse | null>(null);
  const [scanError, setScanError] = useState("");
  const [batchResult, setBatchResult] = useState<BatchScanResponse | null>(null);
  const [batchError, setBatchError] = useState("");
  const [wfCode, setWfCode] = useState("600519");
  const [wfStrategy, setWfStrategy] = useState("macd_cross");
  const [wfDays, setWfDays] = useState(730);
  const [wfWindow, setWfWindow] = useState(120);
  const [wfStep, setWfStep] = useState(20);
  const [wfTopN, setWfTopN] = useState(5);
  const [wfJson, setWfJson] = useState(DEFAULT_SCAN_JSON);
  const [wfLoading, setWfLoading] = useState(false);
  const [wfResult, setWfResult] = useState<WalkForwardResponse | null>(null);
  const [wfError, setWfError] = useState("");

  const strategies = result?.strategies_available ?? DEFAULT_STRATEGIES;

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/backtest/runs?limit=20`);
      if (!res.ok) return;
      setHistory(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/backtest/runs?limit=20`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (!cancelled && data) setHistory(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const runBacktest = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/backtest/${code}?strategy=${strategy}&days=${days}&initial_cash=${initialCash}`,
        { signal: AbortSignal.timeout(60000) }
      );
      if (!res.ok) throw new Error(`请求失败 ${res.status}`);
      const data = await res.json();
      setResult(data);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "回测失败");
    } finally {
      setLoading(false);
    }
  };

  const benchmarkDiff = result
    ? result.total_pnl_pct - result.benchmark.total_return_pct
    : 0;

  const runScan = async () => {
    setScanError("");
    setBatchError("");
    setScanResult(null);
    setBatchResult(null);
    const codes = scanCodes.split("\n").map((s) => s.trim()).filter(Boolean);
    let params: Record<string, number[]>;
    try {
      const raw = JSON.parse(scanJson);
      params = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
          setScanError(`参数「${k}」必须是至少含一个数值的数组`);
          return;
        }
        params[k] = v as number[];
      }
    } catch {
      setScanError("扫描参数 JSON 解析失败，请检查格式");
      return;
    }
    setScanLoading(true);
    try {
      if (codes.length > 0) {
        // 填了股票列表 → 多股票批量扫描（跨股票聚合 Top 参数集）
        const res = await batchScan({
          codes,
          strategy: scanStrategy,
          param_grid: params,
          days: scanDays,
          max_combos: 64,
        });
        setBatchResult(res);
      } else {
        // 留空 → 对上方当前股票做单股参数扫描
        const res = await scanBacktests({
          code,
          strategy: scanStrategy,
          days: scanDays,
          params,
        });
        setScanResult(res);
      }
      refreshHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "扫描失败";
      if (codes.length > 0) setBatchError(msg);
      else setScanError(msg);
    } finally {
      setScanLoading(false);
    }
  };

  const runResearch = async () => {
    setScanError("");
    setResearchResult(null);
    const ratio = Number(trainRatio);
    if (!Number.isFinite(ratio) || ratio < 0.5 || ratio > 0.9) {
      setScanError("训练占比需在 0.5 ~ 0.9 之间");
      return;
    }
    let params: Record<string, number>;
    try {
      const raw = JSON.parse(scanJson);
      params = {};
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) {
          if (v.length === 0 || !v.every((x) => typeof x === "number")) {
            setScanError(`参数「${k}」必须是数值或数值数组`);
            return;
          }
          params[k] = v[Math.floor(v.length / 2)];
        } else if (typeof v === "number" && Number.isFinite(v)) {
          params[k] = v;
        } else {
          setScanError(`参数「${k}」必须是数值或数值数组`);
          return;
        }
      }
    } catch {
      setScanError("研究参数 JSON 解析失败，请检查格式");
      return;
    }
    setResearchLoading(true);
    try {
      const res = await researchBacktest({
        code,
        strategy: scanStrategy,
        days: scanDays,
        params,
        train_ratio: ratio,
      });
      setResearchResult(res);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "研究失败");
    } finally {
      setResearchLoading(false);
    }
  };

  const runWalkForward = async () => {
    setWfError("");
    setWfResult(null);
    const wfCodeTrimmed = wfCode.trim();
    if (!wfCodeTrimmed) {
      setWfError("请输入股票代码");
      return;
    }
    if (!Number.isFinite(wfWindow) || wfWindow <= 0) {
      setWfError("窗口天数需为正数");
      return;
    }
    if (!Number.isFinite(wfStep) || wfStep <= 0) {
      setWfError("步长需为正数");
      return;
    }
    if (!Number.isFinite(wfTopN) || wfTopN < 1) {
      setWfError("Top N 需为正整数");
      return;
    }
    let grid: Record<string, number[]>;
    try {
      const raw = JSON.parse(wfJson);
      grid = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
          setWfError(`参数「${k}」必须是至少含一个数值的数组`);
          return;
        }
        grid[k] = v as number[];
      }
    } catch {
      setWfError("滚动重训参数 JSON 解析失败，请检查格式");
      return;
    }
    setWfLoading(true);
    try {
      const res = await walkForward({
        code: wfCodeTrimmed,
        strategy: wfStrategy,
        param_grid: grid,
        days: wfDays,
        window: wfWindow,
        step: wfStep,
        top_n: wfTopN,
        max_combos: 150,
      });
      setWfResult(res);
    } catch (e) {
      setWfError(e instanceof Error ? e.message : "滚动重训失败");
    } finally {
      setWfLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      <h2 className="text-lg font-bold text-(--color-text-primary)">回测分析</h2>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">选择策略和参数，回测历史表现</p>

      {/* Controls */}
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
          onClick={runBacktest}
          disabled={loading}
          className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "回测中..." : "开始回测"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">回测失败: {error}</p>}

      {result && (
        <>
          {/* Summary cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">策略收益</div>
              <div className={`mt-1 text-lg font-bold ${result.total_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                {result.total_pnl_pct >= 0 ? "+" : ""}{result.total_pnl_pct}%
              </div>
              <div className="text-xs text-(--color-text-tertiary)">¥{result.total_pnl >= 0 ? "+" : ""}{result.total_pnl.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">买入持有</div>
              <div className={`mt-1 text-lg font-bold ${result.benchmark.total_return_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                {result.benchmark.total_return_pct >= 0 ? "+" : ""}{result.benchmark.total_return_pct}%
              </div>
              <div className="text-xs text-(--color-text-tertiary)">{result.benchmark.shares_bought} 股</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">超额收益</div>
              <div className={`mt-1 text-lg font-bold ${benchmarkDiff >= 0 ? "text-red-500" : "text-green-600"}`}>
                {benchmarkDiff >= 0 ? "+" : ""}{benchmarkDiff.toFixed(2)}%
              </div>
              <div className="text-xs text-(--color-text-tertiary)">vs 买入持有</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">胜率</div>
              <div className="mt-1 text-lg font-bold text-(--color-text-primary)">{result.win_rate}%</div>
              <div className="text-xs text-(--color-text-tertiary)">{result.win_trades}胜 {result.loss_trades}负</div>
            </div>
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <div className="text-xs font-medium text-(--color-text-secondary)">最大回撤</div>
              <div className="mt-1 text-lg font-bold text-red-500">{result.max_drawdown_pct}%</div>
            </div>
          </div>

          {/* Chart */}
          {result.kline.length > 0 && (
            <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
              <BacktestChart
                kline={result.kline}
                signals={result.signals}
                equityCurve={result.equity_curve}
                benchmark={result.benchmark}
                initialCash={result.initial_cash}
              />
            </div>
          )}

          {/* Trade log */}
          <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
            <div className="border-b border-(--color-border) px-5 py-3">
              <h3 className="text-sm font-bold text-(--color-text-primary)">交易记录（最近 {result.trades.length} 笔）</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-(--color-border-light)">
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">日期</th>
                    <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">类型</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">价格</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">股数</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">盈亏</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">收益率</th>
                    <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">余额</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-b border-[#F9FAFB] last:border-b-0">
                      <td className="px-5 py-2.5 text-(--color-text-primary)">{t.date}</td>
                      <td className="px-5 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${
                          t.type === "买入" ? "bg-(--color-accent-light) text-(--color-accent)" :
                          t.type === "卖出" || t.type === "平仓" ? "bg-green-50 text-green-600" : ""
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">¥{t.price.toFixed(3)}</td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{t.shares ?? "-"}</td>
                      <td className={`px-5 py-2.5 text-right font-medium ${(t.pnl ?? 0) >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}¥${t.pnl.toFixed(2)}` : "-"}
                      </td>
                      <td className={`px-5 py-2.5 text-right font-medium ${(t.pnl_pct ?? 0) >= 0 ? "text-red-500" : "text-green-600"}`}>
                        {t.pnl_pct != null ? `${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(2)}%` : "-"}
                      </td>
                      <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">¥{t.cash_after.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer summary */}
          <div className="mt-4 rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
            <p className="text-xs text-(--color-text-secondary)">
              策略: {result.strategy} · 回测区间: {result.period_days} 天 · 本金: ¥{result.initial_cash.toLocaleString()} · 终值: ¥{result.final_cash.toLocaleString()}
            </p>
          </div>
        </>
      )}

      {/* 批量扫描与研究 */}
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
              onClick={runScan}
              disabled={scanLoading || researchLoading}
              className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {scanLoading ? "扫描中..." : "执行扫描"}
            </button>
            <button
              onClick={runResearch}
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

        {/* 滚动重训 Walk-Forward */}
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
              onClick={runWalkForward}
              disabled={wfLoading}
              className="rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {wfLoading ? "滚动研究中..." : "滚动研究"}
            </button>
          </div>
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

      {/* 历史回测记录（每次回测自动落库） */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-(--color-text-primary)">
            历史测试记录
            {history && history.total_runs > 0 && (
              <span className="ml-2 text-xs font-normal text-(--color-text-tertiary)">累计 {history.total_runs} 次回测已自动沉淀</span>
            )}
          </h3>
          <button
            onClick={refreshHistory}
            className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-raised) hover:text-(--color-text-primary)"
          >
            刷新
          </button>
        </div>

        {!history ? (
          <p className="mt-3 text-xs text-(--color-text-tertiary)">加载中...</p>
        ) : history.strategy_stats.length === 0 ? (
          <p className="mt-3 rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 text-xs text-(--color-text-tertiary)">
            还没有回测记录。在上面选择股票和策略点「开始回测」，结果会自动保存到这里，用于跨策略对比。
          </p>
        ) : (
          <>
            {/* 按策略聚合统计 */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {history.strategy_stats.map((s) => (
                <div key={s.strategy_key} className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-(--color-text-primary)">{s.strategy_name}</span>
                    <span className="rounded-full bg-(--color-bg-raised) px-2 py-0.5 text-[11px] text-(--color-text-tertiary)">{s.run_count} 次</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={`text-lg font-bold ${s.avg_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                      {s.avg_pnl_pct >= 0 ? "+" : ""}{s.avg_pnl_pct}%
                    </span>
                    <span className="text-[11px] text-(--color-text-tertiary)">平均收益</span>
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-(--color-text-secondary)">
                    <span>胜率 {s.avg_win_rate}%</span>
                    <span>回撤 {s.avg_max_drawdown}%</span>
                    <span>盈利 {s.profitable_runs}/{s.run_count} 次</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 明细表 */}
            <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
              <div className="border-b border-(--color-border) px-5 py-3">
                <h3 className="text-sm font-bold text-(--color-text-primary)">最近记录</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-(--color-border-light)">
                      <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">时间</th>
                      <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">股票</th>
                      <th className="px-5 py-2.5 text-left font-semibold text-(--color-text-secondary)">策略</th>
                      <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">天数</th>
                      <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">收益</th>
                      <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">买入持有</th>
                      <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">胜率</th>
                      <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">交易数</th>
                      <th className="px-5 py-2.5 text-right font-semibold text-(--color-text-secondary)">最大回撤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.runs.map((r) => (
                      <tr key={r.id} className="border-b border-[#F9FAFB] last:border-b-0">
                        <td className="px-5 py-2.5 text-(--color-text-tertiary)">{r.created_at.slice(5, 16)}</td>
                        <td className="px-5 py-2.5 text-(--color-text-primary)">{r.name || r.code} <span className="text-(--color-text-tertiary)">{r.code}</span></td>
                        <td className="px-5 py-2.5 text-(--color-text-secondary)">{r.strategy_name}</td>
                        <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{r.days}</td>
                        <td className={`px-5 py-2.5 text-right font-semibold ${r.total_pnl_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                          {r.total_pnl_pct >= 0 ? "+" : ""}{r.total_pnl_pct}%
                        </td>
                        <td className={`px-5 py-2.5 text-right ${r.benchmark_return_pct >= 0 ? "text-red-500" : "text-green-600"}`}>
                          {r.benchmark_return_pct >= 0 ? "+" : ""}{r.benchmark_return_pct}%
                        </td>
                        <td className="px-5 py-2.5 text-right text-(--color-text-primary)">{r.win_rate}%</td>
                        <td className="px-5 py-2.5 text-right text-(--color-text-secondary)">{r.total_trades}</td>
                        <td className="px-5 py-2.5 text-right text-red-500">{r.max_drawdown_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
