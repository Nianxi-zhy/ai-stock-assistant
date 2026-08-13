"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, IPriceLine, Time } from "lightweight-charts";
import type { KlineBar } from "@/lib/api";

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

interface BacktestChartProps {
  kline: KlineBar[];
  signals: Signal[];
  equityCurve: EquityPoint[];
  benchmark: BenchmarkData;
  initialCash: number;
}

export default function BacktestChart({ kline, signals, equityCurve, benchmark, initialCash }: BacktestChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const equityContainerRef = useRef<HTMLDivElement>(null);

  // 主图（K 线 + 信号 + MA + 成交量）
  const mainChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // 收益曲线图
  const equityChartRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const benchSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const initLineRef = useRef<IPriceLine | null>(null);

  // 主图：仅创建一次 chart 与 series
  useEffect(() => {
    if (!chartContainerRef.current || mainChartRef.current) return;

    const el = document.documentElement;
    const bg = getComputedStyle(el).getPropertyValue("--color-bg-card").trim() || "#fff";
    const text = getComputedStyle(el).getPropertyValue("--color-text-secondary").trim() || "#6B7280";
    const grid = getComputedStyle(el).getPropertyValue("--color-bg-hover").trim() || "#F3F4F6";
    const border = getComputedStyle(el).getPropertyValue("--color-border").trim() || "#E5E7EB";

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 420,
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: false },
    });
    mainChartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#EF4444",
      downColor: "#22C55E",
      borderUpColor: "#EF4444",
      borderDownColor: "#22C55E",
      wickUpColor: "#EF4444",
      wickDownColor: "#22C55E",
    });

    ma5SeriesRef.current = chart.addSeries(LineSeries, {
      color: "#F59E0B",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    ma20SeriesRef.current = chart.addSeries(LineSeries, {
      color: "#3B82F6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      mainChartRef.current = null;
      candleSeriesRef.current = null;
      ma5SeriesRef.current = null;
      ma20SeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // 主图：数据变化时增量更新
  useEffect(() => {
    if (!mainChartRef.current || kline.length === 0) return;

    const chart = mainChartRef.current;

    candleSeriesRef.current?.setData(
      kline.map((k) => ({
        time: k.date as string,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }))
    );

    const markers = signals.map((s) => ({
      time: s.date,
      position: (s.type === "buy" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
      color: s.type === "buy" ? "#22C55E" : "#EF4444",
      shape: (s.type === "buy" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
      text: s.type === "buy" ? "买" : "卖",
    }));
    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    } else if (candleSeriesRef.current) {
      markersRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
    }

    const ma5Data: { time: string; value: number }[] = [];
    kline.forEach((k, i) => {
      if (i < 4) return;
      const slice = kline.slice(i - 4, i + 1);
      const avg = slice.reduce((s, v) => s + v.close, 0) / 5;
      ma5Data.push({ time: k.date, value: parseFloat(avg.toFixed(3)) });
    });
    ma5SeriesRef.current?.setData(ma5Data);

    const ma20Data: { time: string; value: number }[] = [];
    kline.forEach((k, i) => {
      if (i < 19) return;
      const slice = kline.slice(i - 19, i + 1);
      const avg = slice.reduce((s, v) => s + v.close, 0) / 20;
      ma20Data.push({ time: k.date, value: parseFloat(avg.toFixed(3)) });
    });
    ma20SeriesRef.current?.setData(ma20Data);

    volumeSeriesRef.current?.setData(
      kline.map((k) => ({
        time: k.date,
        value: k.volume,
        color: k.close >= k.open ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)",
      }))
    );

    chart.timeScale().fitContent();
  }, [kline, signals]);

  // 收益曲线图：仅创建一次 chart 与 series
  useEffect(() => {
    if (!equityContainerRef.current || equityChartRef.current) return;

    const el = document.documentElement;
    const bg = getComputedStyle(el).getPropertyValue("--color-bg-card").trim() || "#fff";
    const text = getComputedStyle(el).getPropertyValue("--color-text-secondary").trim() || "#6B7280";
    const grid = getComputedStyle(el).getPropertyValue("--color-bg-hover").trim() || "#F3F4F6";
    const border = getComputedStyle(el).getPropertyValue("--color-border").trim() || "#E5E7EB";

    const chart = createChart(equityContainerRef.current, {
      width: equityContainerRef.current.clientWidth,
      height: 180,
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: false },
    });
    equityChartRef.current = chart;

    equitySeriesRef.current = chart.addSeries(LineSeries, {
      color: "#3B82F6",
      lineWidth: 2,
      title: "策略",
      priceLineVisible: false,
    });

    const handleResize = () => {
      if (equityContainerRef.current) {
        chart.applyOptions({ width: equityContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      equityChartRef.current = null;
      equitySeriesRef.current = null;
      benchSeriesRef.current = null;
      initLineRef.current = null;
    };
  }, []);

  // 收益曲线图：数据变化时增量更新
  useEffect(() => {
    if (!equityChartRef.current || equityCurve.length === 0) return;

    const chart = equityChartRef.current;
    const el = document.documentElement;
    const border = getComputedStyle(el).getPropertyValue("--color-border").trim() || "#E5E7EB";

    equitySeriesRef.current?.setData(
      equityCurve.map((p) => ({
        time: p.date,
        value: p.value,
      }))
    );

    if (benchmark.shares_bought > 0 && kline.length > 0) {
      if (!benchSeriesRef.current) {
        benchSeriesRef.current = chart.addSeries(LineSeries, {
          color: "#9CA3AF",
          lineWidth: 1,
          lineStyle: 2,
          title: "买入持有",
          priceLineVisible: false,
        });
      }
      const firstClose = kline[0].close;
      const benchData = kline.map((k) => ({
        time: k.date,
        value: benchmark.shares_bought * k.close + (initialCash - benchmark.shares_bought * firstClose),
      }));
      benchSeriesRef.current.setData(benchData);
    } else {
      benchSeriesRef.current?.setData([]);
    }

    if (equitySeriesRef.current) {
      if (initLineRef.current) {
        initLineRef.current.applyOptions({ price: initialCash });
      } else {
        initLineRef.current = equitySeriesRef.current.createPriceLine({
          price: initialCash,
          color: border,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "本金",
        });
      }
    }

    chart.timeScale().fitContent();
  }, [equityCurve, benchmark, kline, initialCash]);

  return (
    <div className="space-y-2">
      <div ref={chartContainerRef} className="w-full" />
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) px-3 py-1">
        <div className="flex items-center gap-4 text-[10px] text-(--color-text-secondary)">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-[#F59E0B]" /> MA5
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-[#3B82F6]" /> MA20
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-[#22C55E]" /> 买入
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-[#EF4444]" /> 卖出
          </span>
        </div>
      </div>
      <div ref={equityContainerRef} className="w-full" />
    </div>
  );
}
