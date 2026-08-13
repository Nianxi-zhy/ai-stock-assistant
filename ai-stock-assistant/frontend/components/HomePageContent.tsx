"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import KpiCards from "@/components/KpiCards";
import RecommendationTable from "@/components/RecommendationTable";
import PortfolioPanel from "@/components/PortfolioPanel";
import MarketOverview from "@/components/MarketOverview";
import TokenSummary from "@/components/TokenSummary";
import MarketWarning from "@/components/MarketWarning";
import type { MarketEnvironmentResponse, RecommendationReport, RecommendationItem, FilterSettings } from "@/lib/api";
import { fetchMarketEnvironment, fetchRecommendations, refreshRecommendations, fetchFilterSettings, updateFilterSettings } from "@/lib/api";

export interface HomePageContentProps {
  onSelectStock: (item: RecommendationItem) => void;
  onNavigateToHoldings?: () => void;
  onHeaderReady?: (data: {
    reportDate?: string;
    loading: boolean;
    onRefresh: () => void;
    filterSettings: FilterSettings | null;
    onAnalyze: (min: number, max: number) => void;
  }) => void;
  boughtMap: Record<string, number>;
  onBuy: (code: string, name: string, price: number, quantity?: number) => Promise<void>;
  onUndo: (code: string) => Promise<void>;
}

export default function HomePageContent({ onSelectStock, onNavigateToHoldings, onHeaderReady, boughtMap, onBuy, onUndo }: HomePageContentProps) {
  const [marketEnv, setMarketEnv] = useState<MarketEnvironmentResponse | null>(null);
  const [marketEnvLoaded, setMarketEnvLoaded] = useState(false);
  const [report, setReport] = useState<RecommendationReport | null>(null);
  const [filterSettings, setFilterSettings] = useState<FilterSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, f] = await Promise.all([
        fetchRecommendations(10, 5),
        fetchFilterSettings(),
      ]);
      setReport(r);
      setFilterSettings(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cached = localStorage.getItem("marketEnv_today");
    let cachedEnv: MarketEnvironmentResponse | null = null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed._date === today) {
          cachedEnv = parsed;
        }
      } catch {}
    }

    const applyMarketEnv = (env: MarketEnvironmentResponse) => {
      setMarketEnv(env);
      setMarketEnvLoaded(true);
      Promise.all([
        fetchRecommendations(10, 5),
        fetchFilterSettings(),
      ]).then(([r, f]) => {
        setReport(r);
        setFilterSettings(f);
      }).catch(() => {});
    };

    if (cachedEnv) {
      applyMarketEnv(cachedEnv);
    } else {
      fetchMarketEnvironment().then((env) => {
        localStorage.setItem("marketEnv_today", JSON.stringify({ ...env, _date: today }));
        applyMarketEnv(env);
      }).catch(() => {
        setMarketEnvLoaded(true);
        Promise.all([
          fetchRecommendations(10, 5),
          fetchFilterSettings(),
        ]).then(([r, f]) => {
          setReport(r);
          setFilterSettings(f);
        }).catch(() => {});
      });
    }
  }, []);

  const handleAnalyze = useCallback(async (minPrice: number, maxPrice: number) => {
    setError("");
    setLoading(true);
    try {
      await updateFilterSettings({
        low_price_mode: true,
        min_stock_price: minPrice,
        max_stock_price: maxPrice,
      });
      const [r, f] = await Promise.all([
        refreshRecommendations(10, 5),
        fetchFilterSettings(),
      ]);
      setReport(r);
      setFilterSettings(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const headerData = useMemo(() => ({
    reportDate: report?.date,
    loading,
    onRefresh: loadData,
    filterSettings,
    onAnalyze: handleAnalyze,
  }), [report?.date, loading, loadData, filterSettings, handleAnalyze]);

  useEffect(() => {
    onHeaderReady?.(headerData);
  }, [headerData, onHeaderReady]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-5">
        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={loadData} className="font-medium underline hover:no-underline">重试</button>
          </div>
        )}

        {/* Market environment warning */}
        {marketEnv && <MarketWarning env={marketEnv} />}

        {/* Loading state (only before first data load) */}
        {loading && !report?.count && !marketEnvLoaded && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
            <p className="mt-4 text-sm text-(--color-text-secondary)">正在分析，请稍候...</p>
          </div>
        )}

        {/* Main body: 70/30 split (always rendered) */}
        <div className="mt-5 flex gap-5">
          {/* Left Column: AI Recommendations or market message */}
          <div className="w-[70%] min-w-0">
            {report?.paper_mode && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-semibold">纸面模式</span>
                <span>当前市场环境评分较低（{report.env_score}分），以下为模拟推荐，自动进入纸面跟踪，不建议实盘买入</span>
              </div>
            )}
            {report && report.count > 0 ? (
              <>
                <KpiCards report={report} />
                <div className="mt-4">
                  <RecommendationTable
                    report={report}
                    onSelectStock={onSelectStock}
                    boughtMap={boughtMap}
                    onBuy={onBuy}
                    onUndo={onUndo}
                  />
                </div>
                <div className="mt-4">
                  <TokenSummary usage={report.usage_summary} />
                </div>
              </>
            ) : !loading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-(--color-border) bg-(--color-bg-card) px-6 py-12">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-accent-light)">
                  <svg className="h-7 w-7 text-(--color-accent)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m-1-3l1 3m8.5-3l1 3m-1-3l-1 3m-5.25 0h-.008v.008h.008v-.008z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-(--color-text-primary)">AI 智能选股</h3>
                <p className="mt-1 text-sm text-(--color-text-secondary)">今日暂无推荐。在顶栏设置价格范围后，点击「重新推荐」开始分析</p>
              </div>
            ) : null}
          </div>

          {/* Right Column: Portfolio + Market Overview */}
          <div className="w-[30%] min-w-0 space-y-5">
            <PortfolioPanel onNavigateToHoldings={onNavigateToHoldings} />
            <MarketOverview env={marketEnv} />
          </div>
        </div>
      </div>
    </div>
  );
}
