"use client";

import BacktestChart from "../BacktestChart";
import type { BacktestResult } from "./types";

interface BacktestChartsProps {
  result: BacktestResult;
}

export default function BacktestCharts({ result }: BacktestChartsProps) {
  return (
    <BacktestChart
      kline={result.kline}
      signals={result.signals}
      equityCurve={result.equity_curve}
      benchmark={result.benchmark}
      initialCash={result.initial_cash}
    />
  );
}
