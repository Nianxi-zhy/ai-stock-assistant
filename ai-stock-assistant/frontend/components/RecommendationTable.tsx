"use client";

import { useState, Fragment, useEffect } from "react";
import type { RecommendationReport, RecommendationItem, AgentDetail } from "@/lib/api";
import { fetchRealtimePrice } from "@/lib/api";

const ACTION_BADGE: Record<string, { label: string; class: string }> = {
  "买入": { label: "买入", class: "text-blue-600 font-semibold" },
  "持有": { label: "继续持有", class: "text-green-600 font-semibold" },
  "观望": { label: "观察", class: "text-amber-600 font-semibold" },
  "卖出": { label: "卖出", class: "text-red-600 font-semibold" },
};

const RANK_STYLES: Record<number, { bg: string; text: string; ring: string }> = {
  1: { bg: "bg-gradient-to-br from-amber-300 to-amber-500", text: "text-white", ring: "ring-amber-200" },
  2: { bg: "bg-gradient-to-br from-slate-300 to-slate-400", text: "text-white", ring: "ring-slate-200" },
  3: { bg: "bg-gradient-to-br from-amber-600 to-amber-700", text: "text-white", ring: "ring-amber-300" },
};

const AGENT_ICONS: Record<string, string> = { news: "📰", technical: "📊", risk: "⚠️" };

const SIGNAL_CLASSES: Record<string, string> = {
  "利好": "text-green-600", "偏利好": "text-green-600",
  "看涨": "text-green-600", "偏看涨": "text-green-600",
  "低风险": "text-green-600", "偏低风险": "text-green-600",
  "中性": "text-blue-600", "震荡": "text-blue-600",
  "中等风险": "text-blue-600",
  "偏利空": "text-orange-600", "偏看跌": "text-orange-600",
  "偏高风险": "text-orange-600",
  "利空": "text-red-600", "看跌": "text-red-600", "高风险": "text-red-600",
};

function getSignalClass(signal: string): string {
  return SIGNAL_CLASSES[signal] || "text-gray-600";
}

function getRankStyle(rank: number) {
  return RANK_STYLES[rank] || { bg: "bg-(--color-bg-hover)", text: "text-(--color-text-secondary)", ring: "" };
}

function AgentRow({ agent }: { agent: AgentDetail }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5">
      <span className="w-5 text-center text-sm">{AGENT_ICONS[agent.name] || "🤖"}</span>
      <span className="w-24 text-xs font-semibold text-(--color-text-primary)">{agent.label}</span>
      <span className="w-16 text-xs tracking-wide text-amber-400">{"★".repeat(agent.stars)}{"☆".repeat(5 - agent.stars)}</span>
      <span className={`w-16 text-xs font-medium ${getSignalClass(agent.signal)}`}>{agent.signal}</span>
      <span className="flex-1 text-xs text-(--color-text-secondary) truncate">{agent.summary}</span>
    </div>
  );
}

export default function RecommendationTable({
  report,
  onSelectStock,
  boughtMap,
  onBuy,
  onUndo,
}: {
  report: RecommendationReport;
  loading: boolean;
  onRefresh: () => void;
  onSelectStock: (item: RecommendationItem) => void;
  boughtMap: Record<string, number>;
  onBuy: (code: string, name: string, price: number, quantity?: number) => void;
  onUndo: (code: string) => void;
}) {
  const [buyingCode, setBuyingCode] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [buyModal, setBuyModal] = useState<{ code: string; name: string; price: number; quantity: number; realtimePrice: number | null; loadingPrice: boolean } | null>(null);

  const openBuyModal = async (e: React.MouseEvent, code: string, name: string) => {
    e.stopPropagation();
    setBuyModal({ code, name, price: 0, quantity: 100, realtimePrice: null, loadingPrice: true });
    try {
      const data = await fetchRealtimePrice(code);
      setBuyModal((prev) => prev && { ...prev, realtimePrice: data.price, price: data.price, loadingPrice: false });
    } catch {
      setBuyModal((prev) => prev && { ...prev, loadingPrice: false });
    }
  };

  const confirmBuy = async () => {
    if (!buyModal || !buyModal.price) return;
    setBuyingCode(buyModal.code);
    setBuyModal(null);
    await onBuy(buyModal.code, buyModal.name, buyModal.price, buyModal.quantity);
    setBuyingCode(null);
  };

  const handleUndo = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    await onUndo(code);
  };

  const toggleExpand = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    setExpandedRow(expandedRow === code ? null : code);
  };

  const items = report.recommendations;

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--color-border) px-6 py-3">
        <h2 className="text-lg font-bold text-(--color-text-primary)">今日推荐</h2>
        <button className="text-sm font-medium text-(--color-accent) transition-colors hover:text-blue-700">查看更多 →</button>
      </div>

      <div className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-(--color-border-light)">
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">排名</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">股票</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">评分</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">规则分</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">AI 建议</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">目标价</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">实时价</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">止损价</th>
              <th className="px-6 pb-3 pt-1 text-center text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-sm text-(--color-text-secondary)">
                  {report.candidate_count > 0 ? "暂无符合条件的推荐" : "请在顶栏设置价格范围后点击「重新推荐」"}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const badge = ACTION_BADGE[item.action] || ACTION_BADGE["观望"];
                const rankStyle = getRankStyle(item.rank);
                let scoreColor: string;
                let ringHex: string;
                if (item.score >= 70) { scoreColor = "text-green-600"; ringHex = "#22c55e"; }
                else if (item.score >= 60) { scoreColor = "text-blue-600"; ringHex = "#2563eb"; }
                else if (item.score >= 50) { scoreColor = "text-orange-500"; ringHex = "#f97316"; }
                else { scoreColor = "text-red-500"; ringHex = "#ef4444"; }

                let ruleScoreColor: string;
                let ruleRingHex: string;
                const rs = item.rule_score ?? 0;
                if (rs >= 70) { ruleScoreColor = "text-green-600"; ruleRingHex = "#22c55e"; }
                else if (rs >= 50) { ruleScoreColor = "text-blue-600"; ruleRingHex = "#2563eb"; }
                else { ruleScoreColor = "text-red-500"; ruleRingHex = "#ef4444"; }

                const isExpanded = expandedRow === item.code;
                return (
                  <Fragment key={item.code}>
                    <tr
                      className="cursor-pointer border-b border-(--color-border-light) transition-colors hover:bg-(--color-accent-light)"
                    >
                      <td className="px-6 py-4">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${rankStyle.bg} ${rankStyle.text} ring-2 ${rankStyle.ring}`}>
                          {item.rank}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="whitespace-nowrap">
                            <div className="text-sm font-semibold text-(--color-text-primary)">{item.name}</div>
                            <div className="text-xs text-(--color-text-tertiary)">{item.code}</div>
                          </div>
                          <button
                            onClick={(e) => toggleExpand(e, item.code)}
                            className="ml-1 flex h-5 w-5 items-center justify-center rounded text-xs text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-hover) hover:text-(--color-text-secondary)"
                            title="展开 Agent 详情"
                          >
                            <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="relative flex h-14 w-14 items-center justify-center">
                          <svg className="absolute h-14 w-14 -rotate-90" viewBox="0 0 48 48">
                            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-border)" strokeWidth="3.5" />
                            <circle
                              cx="24" cy="24" r="20" fill="none"
                              stroke={ringHex}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeDasharray={125.66}
                              strokeDashoffset={125.66 * (1 - item.score / 100)}
                            />
                          </svg>
                          <span className={`relative text-sm font-bold ${scoreColor}`}>{item.score}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="relative flex h-14 w-14 items-center justify-center">
                          <svg className="absolute h-14 w-14 -rotate-90" viewBox="0 0 48 48">
                            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-border)" strokeWidth="3.5" />
                            <circle
                              cx="24" cy="24" r="20" fill="none"
                              stroke={ruleRingHex}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeDasharray={125.66}
                              strokeDashoffset={125.66 * (1 - rs / 100)}
                            />
                          </svg>
                          <span className={`relative text-sm font-bold ${ruleScoreColor}`}>{item.rule_score ?? "--"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="flex items-center justify-center">
                          <span className={`text-[13px] ${badge.class}`}>
                            {badge.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-emerald-600 font-semibold cursor-pointer" onClick={() => onSelectStock(item)}>
                        ¥{item.target_price?.toFixed(3) ?? "--"}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-(--color-text-primary) font-bold cursor-pointer" onClick={() => onSelectStock(item)}>
                        ¥{item.close_price.toFixed(3)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-red-500 cursor-pointer" onClick={() => onSelectStock(item)}>
                        ¥{item.stop_loss_price?.toFixed(3) ?? "--"}
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="flex items-center justify-center">
                          {boughtMap[item.code] ? (
                            <button
                              onClick={(e) => handleUndo(e, item.code)}
                              className="rounded-xl border border-red-300/40 bg-red-100/40 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm backdrop-blur-md transition-all hover:bg-red-100/60 hover:shadow active:scale-95"
                            >
                              撤销
                            </button>
                          ) : (
                            <button
                              onClick={(e) => openBuyModal(e, item.code, item.name)}
                              disabled={buyingCode === item.code}
                              className="group relative overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white/50 to-white/20 px-3 py-1.5 text-xs font-semibold text-(--color-accent) shadow-[0_2px_8px_rgba(59,130,246,0.15)] backdrop-blur-md transition-all hover:shadow-[0_4px_16px_rgba(59,130,246,0.25)] hover:border-white/50 disabled:opacity-50 active:scale-95 before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b before:from-white/30 before:to-transparent before:opacity-100"
                            >
                              <span className="relative z-10">{buyingCode === item.code ? "..." : "买入"}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && item.agent_details && item.agent_details.length > 0 && (
                      <tr key={`${item.code}-agents`}>
                        <td colSpan={8} className="bg-(--color-bg-raised) px-6 py-3">
                          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-card) px-3 py-2">
                            <div className="flex items-center gap-3 border-b border-(--color-border-light) pb-1.5 mb-1">
                              <span className="text-xs font-bold text-(--color-text-primary)">多 Agent 分析</span>
                              <span className="text-xs text-(--color-text-tertiary)">
                                点击股票行查看完整详情
                              </span>
                            </div>
                            <div className="divide-y divide-(--color-border-light)">
                              {item.agent_details.map((agent) => (
                                <AgentRow key={agent.name} agent={agent} />
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && item.passed_rules && (item.passed_rules.length > 0 || (item.failed_rules && item.failed_rules.length > 0)) && (
                      <tr key={`${item.code}-rules`}>
                        <td colSpan={8} className="bg-(--color-bg-raised) px-6 py-3">
                          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-card) px-3 py-2">
                            <div className="flex items-center gap-3 border-b border-(--color-border-light) pb-1.5 mb-1">
                              <span className="text-xs font-bold text-(--color-text-primary)">规则评分 ({item.rule_score ?? 0}/100)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {item.passed_rules?.map((r, i) => (
                                <span key={i} className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">✓ {r}</span>
                              ))}
                              {item.failed_rules?.map((r, i) => (
                                <span key={i} className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 border border-red-200">✗ {r}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Buy Modal */}
      {buyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setBuyModal(null)}>
          <div className="w-[360px] rounded-2xl bg-(--color-bg-card) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-(--color-text-primary)">买入确认</h3>
            <div className="mt-1 text-sm text-(--color-text-secondary)">{buyModal.name} ({buyModal.code})</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-(--color-text-secondary)">实时价</label>
                {buyModal.loadingPrice ? (
                  <div className="mt-1 h-8 animate-pulse rounded-lg bg-(--color-bg-hover)" />
                ) : (
                  <input
                    type="number"
                    step={0.01}
                    value={buyModal.price}
                    onChange={(e) => setBuyModal({ ...buyModal, price: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-lg border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-[#3B82F6]"
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-(--color-text-secondary)">买入数量（股）</label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={buyModal.quantity}
                  onChange={(e) => setBuyModal({ ...buyModal, quantity: parseInt(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-lg border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-[#3B82F6]"
                />
              </div>
              {!buyModal.loadingPrice && buyModal.price > 0 && (
                <div className="rounded-lg bg-(--color-bg-raised) px-3 py-2 text-xs text-(--color-text-secondary)">
                  预计成本：¥{(buyModal.price * buyModal.quantity).toFixed(2)}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setBuyModal(null)} className="rounded-lg border border-(--color-border) px-4 py-2 text-xs font-semibold text-(--color-text-secondary) hover:bg-(--color-bg-raised)">
                取消
              </button>
              <button
                onClick={confirmBuy}
                disabled={!buyModal.price || buyModal.price <= 0 || buyModal.quantity <= 0}
                className="rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                确认买入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-(--color-border) px-6 py-3">
        <span className="text-xs text-(--color-text-tertiary)">候选 {report.candidate_count} 只 · 分析 {report.analyzed_count} 只</span>
        <div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary)">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-400" />持有</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />观察</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-400" />买入</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" />卖出</span>
        </div>
      </div>
    </div>
  );
}
