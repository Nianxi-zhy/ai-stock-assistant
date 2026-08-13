"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { KlineBar } from "@/lib/api";

export default function KlineChart({ data, ma5, ma20 }: { data: KlineBar[]; ma5?: number[]; ma20?: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // 仅在挂载时创建 chart 与 series 实例一次
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const container = containerRef.current;
    const el = document.documentElement;
    const bg = getComputedStyle(el).getPropertyValue("--color-bg-card").trim() || "#fff";
    const text = getComputedStyle(el).getPropertyValue("--color-text-secondary").trim() || "#6B7280";
    const grid = getComputedStyle(el).getPropertyValue("--color-bg-hover").trim() || "#F3F4F6";
    const border = getComputedStyle(el).getPropertyValue("--color-border").trim() || "#E5E7EB";

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      width: container.clientWidth,
      height: 400,
      crosshair: { mode: 0 },
      timeScale: { borderColor: border, timeVisible: false },
      rightPriceScale: { borderColor: border },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#EF4444",
      downColor: "#22C55E",
      borderDownColor: "#22C55E",
      borderUpColor: "#EF4444",
      wickDownColor: "#22C55E",
      wickUpColor: "#EF4444",
    });

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      color: "#9CA3AF",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ma5SeriesRef.current = null;
      ma20SeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // 数据变化时仅更新 series 数据，不重建 chart
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = chartRef.current;

    candleSeriesRef.current?.setData(
      data.map((d) => ({
        time: d.date as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    if (ma5 && ma5.length > 0) {
      if (!ma5SeriesRef.current) {
        ma5SeriesRef.current = chart.addSeries(LineSeries, { color: "#3B82F6", lineWidth: 2, title: "MA5" });
      }
      ma5SeriesRef.current.setData(data.map((d, i) => ({ time: d.date as any, value: ma5[i] || d.close })));
    } else {
      ma5SeriesRef.current?.setData([]);
    }

    if (ma20 && ma20.length > 0) {
      if (!ma20SeriesRef.current) {
        ma20SeriesRef.current = chart.addSeries(LineSeries, { color: "#F59E0B", lineWidth: 2, title: "MA20" });
      }
      ma20SeriesRef.current.setData(data.map((d, i) => ({ time: d.date as any, value: ma20[i] || d.close })));
    } else {
      ma20SeriesRef.current?.setData([]);
    }

    volumeSeriesRef.current?.setData(
      data.map((d) => ({
        time: d.date as any,
        value: d.volume,
        color: d.close >= d.open ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)",
      }))
    );

    chart.timeScale().fitContent();
  }, [data, ma5, ma20]);

  return <div ref={containerRef} className="w-full rounded-lg" />;
}
