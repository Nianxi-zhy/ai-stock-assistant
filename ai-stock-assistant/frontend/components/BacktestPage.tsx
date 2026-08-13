"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScanResponse, ResearchResponse, BatchScanResponse, WalkForwardResponse } from "@/lib/api";
import { scanBacktests, researchBacktest, batchScan, walkForward, API_BASE } from "@/lib/api";
import { DEFAULT_SCAN_JSON, DEFAULT_STRATEGIES, type BacktestResult, type BacktestRunsResponse } from "./backtest/types";
import BacktestForm from "./backtest/BacktestForm";
import BacktestResultView from "./backtest/BacktestResult";
import BacktestParams from "./backtest/BacktestParams";
import BacktestWalkForward from "./backtest/BacktestWalkForward";
import BacktestHistory from "./backtest/BacktestHistory";

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
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/backtest/runs?limit=20`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => { if (!cancelled && data) setHistory(data); })
      .catch(() => {});
    return () => { cancelled = true; };
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
      setResult(await res.json());
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "回测失败");
    } finally {
      setLoading(false);
    }
  };

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
        setBatchResult(await batchScan({ codes, strategy: scanStrategy, param_grid: params, days: scanDays, max_combos: 64 }));
      } else {
        setScanResult(await scanBacktests({ code, strategy: scanStrategy, days: scanDays, params }));
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
      setResearchResult(await researchBacktest({ code, strategy: scanStrategy, days: scanDays, params, train_ratio: ratio }));
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
    if (!wfCodeTrimmed) { setWfError("请输入股票代码"); return; }
    if (!Number.isFinite(wfWindow) || wfWindow <= 0) { setWfError("窗口天数需为正数"); return; }
    if (!Number.isFinite(wfStep) || wfStep <= 0) { setWfError("步长需为正数"); return; }
    if (!Number.isFinite(wfTopN) || wfTopN < 1) { setWfError("Top N 需为正整数"); return; }
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
      setWfResult(await walkForward({
        code: wfCodeTrimmed,
        strategy: wfStrategy,
        param_grid: grid,
        days: wfDays,
        window: wfWindow,
        step: wfStep,
        top_n: wfTopN,
        max_combos: 150,
      }));
    } catch (e) {
      setWfError(e instanceof Error ? e.message : "滚动重训失败");
    } finally {
      setWfLoading(false);
    }
  };

  const formProps = { code, setCode, strategy, setStrategy, days, setDays, initialCash, setInitialCash, strategies, loading, onRunBacktest: runBacktest };
  const paramsProps = { code, strategies, scanStrategy, setScanStrategy, scanDays, setScanDays, trainRatio, setTrainRatio, scanCodes, setScanCodes, scanJson, setScanJson, scanLoading, researchLoading, onScan: runScan, onResearch: runResearch, scanError, scanResult, researchResult, batchResult, batchError };
  const wfProps = { strategies, wfCode, setWfCode, wfStrategy, setWfStrategy, wfDays, setWfDays, wfWindow, setWfWindow, wfStep, setWfStep, wfTopN, setWfTopN, wfJson, setWfJson, wfLoading, onRun: runWalkForward, wfError, wfResult };

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      <h2 className="text-lg font-bold text-(--color-text-primary)">回测分析</h2>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">选择策略和参数，回测历史表现</p>

      <BacktestForm {...formProps} />

      {error && <p className="mt-3 text-sm text-red-500">回测失败: {error}</p>}

      {result && <BacktestResultView result={result} />}

      <BacktestParams {...paramsProps} />

      <BacktestWalkForward {...wfProps} />

      <BacktestHistory history={history} onRefresh={refreshHistory} />
    </div>
  );
}
