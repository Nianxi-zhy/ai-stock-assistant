const API_BASE = "http://localhost:8000/api/v1";

// Simple client-side cache to avoid re-fetching on component remounts
const __apiCache = new Map<string, { data: unknown; expires: number }>();
function __cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = __apiCache.get(key);
  if (hit && Date.now() < hit.expires) {
    return Promise.resolve(hit.data as T);
  }
  return fetcher().then(data => {
    __apiCache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  });
}





export interface KlineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface KlineResponse {
  code: string;
  days: number;
  klines: KlineBar[];
}

export interface AgentDetail {
  name: string;
  label: string;
  stars: number;
  signal: string;
  summary: string;
  details: string;
  status: "ok" | "unavailable" | "failed";
  error: string | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_rmb: number;
  model: string;
}

export interface RecommendationItem {
  rank: number;
  code: string;
  name: string;
  close_price: number;
  passes_price_filter: boolean;
  score: number;
  stars: number;
  action: string;
  reason: string;
  token_usage: TokenUsage | null;
  rule_score: number;
  passed_rules: string[];
  failed_rules: string[];
  news_count: number;
  agent_details: AgentDetail[];
  target_price: number | null;
  stop_loss_price: number | null;
  trade_date: string | null;
  analysis_status: "complete" | "partial";
  analysis_warnings: string[];
}

export interface CandidateFailure {
  code: string;
  name: string;
  stage: string;
  error: string;
}

export interface RecommendationReport {
  date: string;
  run_id: string;
  generated_at: string;
  as_of_trade_date: string | null;
  parameters: Record<string, unknown>;
  budget: Record<string, unknown>;
  filter_mode: { low_price_mode: boolean; max_stock_price: number };
  candidate_count: number;
  analyzed_count: number;
  count: number;
  usage_summary: TokenUsage;
  recommendations: RecommendationItem[];
  failed_candidates: CandidateFailure[];
  env_status?: string | null;
  env_score?: number | null;
  paper_mode?: boolean;
}

export interface FilterSettings {
  low_price_mode: boolean;
  max_stock_price: number;
  min_stock_price: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(600000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export function fetchRecommendations(
  candidateLimit = 10,
  topN = 5
): Promise<RecommendationReport> {
  const key = `rec:${candidateLimit}:${topN}`;
  return __cached(key, 30000,
    () => fetchJson<RecommendationReport>(
      `${API_BASE}/recommendations/today?candidate_limit=${candidateLimit}&top_n=${topN}`
    ));
}

export function refreshRecommendations(
  candidateLimit = 10,
  topN = 5
): Promise<RecommendationReport> {
  return fetchJson<RecommendationReport>(
    `${API_BASE}/recommendations/today?candidate_limit=${candidateLimit}&top_n=${topN}`,
    { method: "POST" }
  );
}

export function fetchFilterSettings(): Promise<FilterSettings> {
  return __cached("filter_settings", 30000,
    () => fetchJson<FilterSettings>(`${API_BASE}/settings/filter`));
}

export function updateFilterSettings(
  body: Partial<FilterSettings>
): Promise<FilterSettings> {
  return fetchJson<FilterSettings>(`${API_BASE}/settings/filter`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── 持仓管理 ───

export interface HoldingItem {
  id: number;
  code: string;
  name: string;
  buy_date: string;
  buy_price: number;
  quantity: number;
  current_price: number;
  stop_loss: number;
  take_profit: number;
  ai_score_at_buy: number;
  buy_reason: string;
  status: string;
  sell_price: number;
  pnl_pct: number | null;
  pnl_amount: number | null;
  market_value: number | null;
  days_held: number | null;
  created_at: string;
  updated_at: string;
}

export interface HoldingListResponse {
  count: number;
  total_market_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  items: HoldingItem[];
}

export interface HoldingCreateRequest {
  code: string;
  name: string;
  buy_price: number;
  quantity: number;
  stop_loss?: number;
  take_profit?: number;
  buy_reason?: string;
}

export interface HoldingUpdateRequest {
  stop_loss?: number;
  take_profit?: number;
  buy_price?: number;
}

export interface AddPositionRequest {
  add_price: number;
  add_quantity: number;
  add_reason?: string;
}

export interface TradeRecord {
  id: number;
  holding_id: number | null;
  code: string;
  name: string;
  trade_date: string;
  trade_type: string;
  price: number;
  quantity: number;
  reason: string;
  pnl: number;
  pnl_pct: number;
  created_at: string;
}

export interface TradeListResponse {
  count: number;
  items: TradeRecord[];
}

export interface TradeStatsResponse {
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_pnl: number;
  avg_return: number;
  max_return: number;
  min_return: number;
  max_drawdown: number;
  avg_holding_days: number;
}

export interface MonthlyPnL {
  month: string;
  trade_count: number;
  total_pnl: number;
  win_count: number;
}

export interface DailyReviewResult {
  holding_id: number;
  code: string;
  name: string;
  action: string;
  score: number;
  stars: number;
  reason: string;
  current_price: number;
  pnl_pct: number;
  suggested_sell_price?: number | null;
}

export interface DailyRoutineResponse {
  date: string;
  holdings_reviewed: number;
  new_candidates: number;
  new_recommendations: number;
  total_token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_rmb: number };
  reviews: DailyReviewResult[];
}

export interface HoldingAdvice {
  holding_id: number;
  code: string;
  name: string;
  action: string;
  severity: string;
  reason: string;
  days_held: number;
  pnl_pct: number;
  pnl_amount: number;
  market_value: number;
  buy_price: number;
  current_price: number;
  llm_analyzed: boolean;
  suggested_sell_price?: number | null;
}

export interface HoldingsAdviceResponse {
  items: HoldingAdvice[];
}

// ─── 已平仓实时追踪 ───

export interface SoldWatchItem {
  code: string;
  name: string;
  sell_price: number;
  sell_date: string;
  quantity: number;
  current_price: number;
  diff: number;
  diff_pct: number;
  status: "up" | "down" | "flat";
}

export interface SoldWatchResponse {
  items: SoldWatchItem[];
  updated_at: string;
}

export function fetchSoldWatch(): Promise<SoldWatchResponse> {
  return fetchJson<SoldWatchResponse>(`${API_BASE}/portfolio/sold-watch`);
}

// ─── 大盘环境检测 ───

export interface MarketIndexData {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  score: number;
}

export interface MarketEnvironmentResponse {
  status: "suitable" | "cautious" | "unsuitable";
  score: number;
  summary: string;
  details: Record<string, number>;
  indices: MarketIndexData[];
  timestamp: string;
}

export function fetchMarketEnvironment(): Promise<MarketEnvironmentResponse> {
  return fetchJson<MarketEnvironmentResponse>(`${API_BASE}/market/environment`);
}

// ─── 纸面跟踪（模拟结算，与真实交易记录隔离） ───

export interface PaperTrackItem {
  id: number;
  run_id: string;
  recommend_date: string;
  code: string;
  name: string;
  rank: number;
  score: number;
  entry_price: number;
  entry_date: string;
  env_status: string;
  env_score: number;
  status: "open" | "closed";
  latest_price: number;
  latest_date: string;
  exit_price: number;
  exit_date: string;
  pnl: number;
  pnl_pct: number;
  days_held: number;
}

export interface PaperEnvStat {
  count: number;
  win: number;
  win_rate: number;
  avg_pnl_pct: number;
}

export interface PaperTrackResponse {
  items: PaperTrackItem[];
  stats: {
    total: number;
    open: number;
    closed: number;
    win_count: number;
    win_rate: number;
    avg_pnl_pct: number;
    env_breakdown: Record<string, PaperEnvStat>;
  };
}

export function fetchPaperTrack(): Promise<PaperTrackResponse> {
  return fetchJson<PaperTrackResponse>(`${API_BASE}/paper/track`);
}

export function syncPaperTrack(): Promise<{ synced: number; updated: number; settled: number }> {
  return fetchJson<{ synced: number; updated: number; settled: number }>(`${API_BASE}/paper/track/sync`, {
    method: "POST",
  });
}

export function fetchHoldingsAdvice(): Promise<HoldingsAdviceResponse> {
  return __cached("holdings_advice", 30000,
    () => fetchJson<HoldingsAdviceResponse>(`${API_BASE}/portfolio/holdings-advice`));
}

export function fetchHoldings(status = "holding"): Promise<HoldingListResponse> {
  return fetchJson<HoldingListResponse>(`${API_BASE}/portfolio?status=${status}`);
}

export function refreshHoldingsPrices(): Promise<{ status: string; updated: number }> {
  return fetchJson<{ status: string; updated: number }>(`${API_BASE}/portfolio/refresh-prices`, { method: "POST" });
}

export function createHolding(data: HoldingCreateRequest): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function sellHolding(holdingId: number, sellPrice = 0, reason = ""): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}/sell?sell_price=${sellPrice}&reason=${encodeURIComponent(reason)}`, {
    method: "POST",
  });
}

export function updateHolding(holdingId: number, data: HoldingUpdateRequest): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function addPosition(holdingId: number, data: AddPositionRequest): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}/add-position`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function createSellOrder(holdingId: number, sellPrice: number): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}/sell-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sell_price: sellPrice }),
  });
}

export function updateSellOrderPrice(holdingId: number, sellPrice: number): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}/sell-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sell_price: sellPrice }),
  });
}

export function confirmSell(holdingId: number, reason = "挂单成交"): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}/confirm-sell?reason=${encodeURIComponent(reason)}`, {
    method: "POST",
  });
}

export function cancelSellOrder(holdingId: number): Promise<HoldingItem> {
  return fetchJson<HoldingItem>(`${API_BASE}/portfolio/${holdingId}/cancel-sell`, {
    method: "POST",
  });
}

export function deleteHolding(holdingId: number): Promise<void> {
  return fetchJson<void>(`${API_BASE}/portfolio/${holdingId}`, { method: "DELETE" });
}

export function fetchTrades(
  limit = 50,
  tradeType?: string,
  sort = "desc",
  code?: string
): Promise<TradeListResponse> {
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (tradeType) params.set("trade_type", tradeType);
  if (code) params.set("code", code);
  return fetchJson<TradeListResponse>(`${API_BASE}/trades?${params}`);
}

export function fetchTradeStats(): Promise<TradeStatsResponse> {
  return fetchJson<TradeStatsResponse>(`${API_BASE}/trades/stats`);
}

export function fetchMonthlyPnL(): Promise<MonthlyPnL[]> {
  return fetchJson<MonthlyPnL[]>(`${API_BASE}/trades/monthly`);
}

export interface SingleAnalysisResponse {
  code: string;
  name: string;
  score: number;
  stars: number;
  action: string;
  reason: string;
  close_price: number;
  passes_price_filter: boolean | null;
  token_usage: TokenUsage | null;
  agent_details: AgentDetail[];
  rule_score: number | null;
  passed_rules: string[];
  failed_rules: string[];
}

export function fetchSingleAnalysis(code: string, name = "", days = 60): Promise<SingleAnalysisResponse> {
  return fetchJson<SingleAnalysisResponse>(`${API_BASE}/analysis/single`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name, days, with_news: true }),
  });
}

export interface StockSearchResult {
  code: string;
  name: string;
}

export function searchStocks(q: string): Promise<StockSearchResult[]> {
  return fetchJson<StockSearchResult[]>(
    `${API_BASE}/stocks/search?q=${encodeURIComponent(q)}`
  );
}

export function fetchKline(code: string, days = 60): Promise<KlineResponse> {
  return fetchJson<KlineResponse>(`${API_BASE}/stocks/${code}/kline?days=${days}`);
}

export interface IndicatorRecord {
  date: string;
  macd_dif: number | null;
  macd_dea: number | null;
  macd_hist: number | null;
  rsi: number | null;
  boll_upper: number | null;
  boll_mid: number | null;
  boll_lower: number | null;
}

export interface IndicatorsHistoryResponse {
  code: string;
  days: number;
  records: IndicatorRecord[];
}

export function fetchRealtimePrice(code: string): Promise<{ code: string; price: number }> {
  return fetchJson<{ code: string; price: number }>(`${API_BASE}/stocks/realtime/${code}`);
}

export function fetchIndicatorsHistory(code: string, days = 120): Promise<IndicatorsHistoryResponse> {
  return fetchJson<IndicatorsHistoryResponse>(`${API_BASE}/stocks/${code}/indicators-history?days=${days}`);
}

export function fetchIndicators(code: string, days = 60, name = ""): Promise<any> {
  return fetchJson<any>(`${API_BASE}/stocks/${code}/indicators?days=${days}&name=${encodeURIComponent(name)}`);
}

export function runDailyRoutine(): Promise<DailyRoutineResponse> {
  return fetchJson<DailyRoutineResponse>(`${API_BASE}/daily-routine`, { method: "POST" });
}

export interface DailyUsage {
  date: string;
  call_count: number;
  total_tokens: number;
  cache_hit_tokens: number;
  cost_rmb: number;
}

export interface TokenTotalResponse {
  cumulative_prompt_tokens: number;
  cumulative_completion_tokens: number;
  cumulative_total_tokens: number;
  cumulative_cache_hit_tokens: number;
  cumulative_cost_rmb: number;
  total_calls: number;
  model: string;
  daily_usage: DailyUsage[];
  latest_run: DailyUsage | null;
}

export function fetchTokenTotal(): Promise<TokenTotalResponse> {
  return __cached("token_total", 10000,
    () => fetchJson<TokenTotalResponse>(`${API_BASE}/usage/total`));
}

// ─── 批量扫描与研究 ───

export interface ScanRunResult {
  params: Record<string, number>;
  total_pnl_pct: number;
  win_rate: number;
  max_drawdown_pct: number;
  total_trades: number;
  benchmark_return_pct: number;
}

export interface ScanResponse {
  code: string;
  strategy: string;
  combos_evaluated: number;
  truncated: boolean;
  warning: string;
  results: ScanRunResult[];
}

export interface ResearchCandidate {
  param: Record<string, number>;
  train_pnl_pct: number;
  train_win_rate: number;
  val_pnl_pct: number;
  val_win_rate: number;
  train_drawdown: number;
  val_drawdown: number;
}

export interface ResearchResponse {
  code: string;
  strategy: string;
  train_ratio: number;
  split_end: string;
  val_start: string;
  top: ResearchCandidate[];
}

export interface ScanBacktestRequest {
  code: string;
  strategy: string;
  days: number;
  params: Record<string, number[]>;
}

export interface ResearchBacktestRequest {
  code: string;
  strategy: string;
  days: number;
  params: Record<string, number>;
  train_ratio: number;
}

export function scanBacktests(body: ScanBacktestRequest): Promise<ScanResponse> {
  return fetchJson<ScanResponse>(`${API_BASE}/backtest/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function researchBacktest(body: ResearchBacktestRequest): Promise<ResearchResponse> {
  return fetchJson<ResearchResponse>(`${API_BASE}/backtest/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── 阶段 4：多股票批量扫描与滚动重训 ───

export interface BatchScanResult {
  code: string;
  name: string;
  combos_evaluated: number;
  best_params: Record<string, number>;
  best_pnl_pct: number;
  best_win_rate: number;
}

export interface TopParamSet {
  param_key: string;
  positive_stocks: number;
  avg_pnl_pct: number;
  stocks_covered: number;
}

export interface BatchScanResponse {
  strategy: string;
  codes: BatchScanResult[];
  top_param_sets: TopParamSet[];
  warning: string;
  total_runs: number;
}

export interface BatchScanRequest {
  codes: string[];
  strategy: string;
  param_grid: Record<string, number[]>;
  days: number;
  max_combos?: number;
}

export interface WalkForwardWindow {
  window_idx: number;
  train_start: string;
  train_end: string;
  val_start: string;
  val_end: string;
  best_params: Record<string, number>;
  train_pnl_pct: number;
  val_pnl_pct: number;
  train_win_rate: number;
  val_win_rate: number;
}

export interface WalkForwardSummary {
  windows_total: number;
  windows_profitable: number;
  consistency_pct: number;
  avg_val_pnl_pct: number;
}

export interface WalkForwardResponse {
  code: string;
  strategy: string;
  window_days: number;
  step_days: number;
  windows: WalkForwardWindow[];
  summary: WalkForwardSummary;
}

export interface WalkForwardRequest {
  code: string;
  strategy: string;
  param_grid: Record<string, number[]>;
  days: number;
  window: number;
  step: number;
  top_n?: number;
  max_combos?: number;
}

export function batchScan(body: BatchScanRequest): Promise<BatchScanResponse> {
  return fetchJson<BatchScanResponse>(`${API_BASE}/backtest/batch-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function walkForward(body: WalkForwardRequest): Promise<WalkForwardResponse> {
  return fetchJson<WalkForwardResponse>(`${API_BASE}/backtest/walkforward`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
