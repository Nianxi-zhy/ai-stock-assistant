import type { KlineBar } from "@/lib/api";

export interface BacktestTrade {
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

export interface Signal {
  date: string;
  type: "buy" | "sell";
  price: number;
}

export interface EquityPoint {
  date: string;
  value: number;
}

export interface BenchmarkData {
  initial_investment: number;
  shares_bought: number;
  avg_cost: number;
  final_value: number;
  total_return_pct: number;
}

export interface StrategyOption {
  key: string;
  name: string;
}

export interface BacktestResult {
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

export interface BacktestRunRecord {
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

export interface StrategyStat {
  strategy_key: string;
  strategy_name: string;
  run_count: number;
  avg_pnl_pct: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
  profitable_runs: number;
}

export interface BacktestRunsResponse {
  runs: BacktestRunRecord[];
  strategy_stats: StrategyStat[];
  total_runs: number;
}

export const STOCK_PRESETS = [
  { code: "600519", name: "贵州茅台" },
  { code: "000858", name: "五粮液" },
  { code: "600036", name: "招商银行" },
  { code: "601318", name: "中国平安" },
  { code: "300750", name: "宁德时代" },
];

export const PERIOD_OPTIONS = [
  { value: 90, label: "90 天" },
  { value: 180, label: "180 天" },
  { value: 365, label: "1 年" },
  { value: 730, label: "2 年" },
];

export const DEFAULT_STRATEGIES: StrategyOption[] = [
  { key: "macd_cross", name: "MACD 金叉死叉" },
  { key: "multi_indicator", name: "多指标共振" },
  { key: "boll_breakout", name: "布林带突破" },
  { key: "ma_trend", name: "均线趋势跟踪" },
];

export const DEFAULT_SCAN_JSON = JSON.stringify(
  { fast_ma: [5, 10, 15, 20], slow_ma: [20, 40, 60] },
  null,
  2
);
