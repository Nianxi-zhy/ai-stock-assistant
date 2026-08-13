"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import DashboardHeader from "@/components/DashboardHeader";
import HomePageContent from "@/components/HomePageContent";
import TokenTotalPage from "@/components/TokenTotalPage";
import HoldingsPage from "@/components/HoldingsPage";
import TradesPage from "@/components/TradesPage";
import BacktestPage from "@/components/BacktestPage";
import SoldWatchPage from "@/components/SoldWatchPage";
import PaperTrackPage from "@/components/PaperTrackPage";
import StockDetail from "@/components/StockDetail";
import { createHolding, deleteHolding } from "@/lib/api";
import type { RecommendationItem, FilterSettings } from "@/lib/api";

type PageView = "home" | "holdings" | "trades" | "backtest" | "token-total" | "watch" | "paper";

export default function Home() {
  const [page, setPage] = useState<PageView>("home");
  const [detailStock, setDetailStock] = useState<RecommendationItem | null>(null);
  const [boughtMap, setBoughtMap] = useState<Record<string, number>>({});
  const undoRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [actionError, setActionError] = useState("");

  // Auto-dismiss the error banner after a few seconds
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(""), 5000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const errorBanner = actionError ? (
    <div className="fixed left-[240px] right-0 top-0 z-50 flex items-center justify-between border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-700">
      <span>{actionError}</span>
      <button onClick={() => setActionError("")} className="ml-4 font-medium hover:text-red-900" aria-label="关闭">✕</button>
    </div>
  ) : null;
  const [headerData, setHeaderData] = useState<{
    reportDate?: string;
    loading: boolean;
    onRefresh: () => void;
    filterSettings: FilterSettings | null;
    onAnalyze: (min: number, max: number) => void;
  }>({
    loading: false,
    onRefresh: () => {},
    filterSettings: null,
    onAnalyze: () => {},
  });

  const handleBuy = useCallback(async (code: string, name: string, price: number, quantity = 100) => {
    try {
      const holding = await createHolding({ code, name, buy_price: price, quantity });
      setBoughtMap((prev) => ({ ...prev, [code]: holding.id }));
      undoRefs.current[code] = setTimeout(() => {
        setBoughtMap((prev) => { const next = { ...prev }; delete next[code]; return next; });
      }, 30000);
    } catch (e) {
      setActionError(`买入失败：${e instanceof Error ? e.message : "未知错误"}`);
    }
  }, []);

  const handleUndo = useCallback(async (code: string) => {
    const holdingId = boughtMap[code];
    if (!holdingId) return;
    clearTimeout(undoRefs.current[code]);
    delete undoRefs.current[code];
    try {
      await deleteHolding(holdingId);
      setBoughtMap((prev) => { const next = { ...prev }; delete next[code]; return next; });
    } catch (e) {
      setActionError(`撤销失败：${e instanceof Error ? e.message : "未知错误"}`);
    }
  }, [boughtMap]);

  const handleSearchStock = useCallback((code: string, name: string) => {
    const partial: RecommendationItem = {
      rank: 0,
      code,
      name,
      close_price: 0,
      passes_price_filter: null as unknown as boolean,
      score: 0,
      stars: 0,
      action: "",
      reason: "",
      token_usage: null,
      rule_score: 0,
      passed_rules: [],
      failed_rules: [],
      news_count: 0,
      agent_details: [],
      target_price: null,
      stop_loss_price: null,
      trade_date: null,
      analysis_status: "complete",
      analysis_warnings: [],
    };
    setDetailStock(partial);
    setPage("home");
  }, []);

  // If viewing stock detail, show it instead of the home page
  if (detailStock && page === "home") {
    return (
      <div className="flex min-h-screen bg-(--color-bg-main)">
        <Sidebar currentPage={page} onNavigate={(p) => { setPage(p); setDetailStock(null); }} />
        <div className="ml-[240px] flex flex-1 flex-col">
          {errorBanner}
          <DashboardHeader
            reportDate={headerData.reportDate}
            loading={headerData.loading}
            onRefresh={headerData.onRefresh}
            filterSettings={headerData.filterSettings}
            onAnalyze={headerData.onAnalyze}
            onSearchStock={handleSearchStock}
          />
          <div className="flex-1 overflow-y-auto">
            <StockDetail stock={detailStock} onBack={() => setDetailStock(null)} boughtMap={boughtMap} onBuy={handleBuy} onUndo={handleUndo} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-(--color-bg-main)">
      <Sidebar currentPage={page} onNavigate={(p) => { setPage(p); setDetailStock(null); }} />
      <div className="ml-[240px] flex flex-1 flex-col">
        <DashboardHeader
          reportDate={headerData.reportDate}
          loading={headerData.loading}
          onRefresh={headerData.onRefresh}
          filterSettings={headerData.filterSettings}
          onAnalyze={headerData.onAnalyze}
          onSearchStock={handleSearchStock}
        />
        <div className="flex-1 overflow-y-auto">
          {page === "home" && (
            <HomePageContent
              onSelectStock={setDetailStock}
              onNavigateToHoldings={() => setPage("holdings")}
              onHeaderReady={setHeaderData}
              boughtMap={boughtMap}
              onBuy={handleBuy}
              onUndo={handleUndo}
            />
          )}
          {page === "watch" && <SoldWatchPage />}
          {page === "holdings" && (
            <HoldingsPage onHoldingDeleted={(code) => setBoughtMap((prev) => { const next = { ...prev }; delete next[code]; return next; })} />
          )}
          {page === "trades" && <TradesPage />}
          {page === "paper" && <PaperTrackPage />}
          {page === "token-total" && <TokenTotalPage />}
          {page === "backtest" && <BacktestPage />}
        </div>
      </div>
    </div>
  );
}
