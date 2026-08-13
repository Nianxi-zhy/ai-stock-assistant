"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";

export interface KlineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export default function KlineChart({ data, ma5, ma20 }: { data: KlineBar[]; ma5?: number[]; ma20?: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

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

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#EF4444",
      downColor: "#22C55E",
      borderDownColor: "#22C55E",
      borderUpColor: "#EF4444",
      wickDownColor: "#22C55E",
      wickUpColor: "#EF4444",
    });

    const klineData = data.map((d) => ({
      time: d.date as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candlestickSeries.setData(klineData);

    if (ma5 && ma5.length > 0) {
      const ma5Series = chart.addSeries(LineSeries, { color: "#3B82F6", lineWidth: 2, title: "MA5" });
      ma5Series.setData(data.map((d, i) => ({ time: d.date as any, value: ma5[i] || d.close })));
    }

    if (ma20 && ma20.length > 0) {
      const ma20Series = chart.addSeries(LineSeries, { color: "#F59E0B", lineWidth: 2, title: "MA20" });
      ma20Series.setData(data.map((d, i) => ({ time: d.date as any, value: ma20[i] || d.close })));
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#9CA3AF",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeries.setData(data.map((d) => ({
      time: d.date as any,
      value: d.volume,
      color: d.close >= d.open ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)",
    })));

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, ma5, ma20]);

  return <div ref={containerRef} className="w-full rounded-lg" />;
}
