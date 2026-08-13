"use client";

import { useState, Fragment } from "react";
import type { RecommendationReport, RecommendationItem, AgentDetail } from "@/lib/api";
import { AGENT_ICONS, getSignalClass } from "@/lib/constants";
import BuyModal from "./BuyModal";

const ACTION_BADGE: Record<string, { label: string; class: string }> = {
  "买入": { label: "买入", class: "text-blue-600" },
  "持有": { label: "继续持有", class: "text-green-600" },
  "观望": { label: "观察", class: "text-amber-600" },
  "卖出": { label: "卖出", class: "text-red-600" },
};

const RANK_STYLES: Record<number, { bg: string; text: string; ring: string }> = {
  1: { bg: "bg-gradient-to-br from-amber-300 to-amber-500", text: "text-white", ring: "ring-amber-200" },
  2: { bg: "bg-gradient-to-br from-slate-300 to-slate-400", text: "text-white", ring: "ring-slate-200" },
  3: { bg: "bg-gradient-to-br from-amber-600 to-amber-700", text: "text-white", ring: "ring-amber-300" },
};

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
  onSelectStock: (item: RecommendationItem) => void;
  boughtMap: Record<string, number>;
  onBuy: (code: string, name: string, price: number, quantity?: number) => Promise<void>;
  onUndo: (code: string) => Promise<void>;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [buyModal, setBuyModal] = useState<{ code: string; name: string } | null>(null);

  const openBuyModal = (e: React.MouseEvent, code: string, name: string) => {
    e.stopPropagation();
    setBuyModal({ code, name });
  };

  const confirmBuy = async (price: number, quantity: number) => {
    if (!buyModal) return;
    await onBuy(buyModal.code, buyModal.name, price, quantity);
  };

  const onUndoClick = async (e: React.MouseEvent, code: string) => {
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
      <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h2 className="text-base font-extrabold text-(--color-text-primary)">今日推荐</h2>
        </div>
        <button className="rounded-full px-3 py-1 text-xs font-semibold text-(--color-accent) transition-colors hover:bg-(--color-accent-light)">
          查看更多 →
        </button>
      </div>

      <div className="overflow-hidden px-3 py-3">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">排名</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">股票</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">评分</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">规则分</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">AI建议</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">目标价</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">实时价</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">止损价</th>
              <th className="px-2 pb-1 text-center text-[11px] font-bold text-(--color-text-tertiary)">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-sm text-(--color-text-secondary)">
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
                      className="cursor-pointer transition-all hover:scale-[1.005]"
                    >
                      <td className="px-2 py-2.5">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankStyle.bg} ${rankStyle.text} ring-2 ${rankStyle.ring} shadow-sm`}>
                          {item.rank}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="whitespace-nowrap">
                            <div className="text-sm font-bold text-(--color-text-primary)">{item.name}</div>
                            <div className="text-[10px] text-(--color-text-tertiary)">{item.code}</div>
                          </div>
                          <button
                            onClick={(e) => toggleExpand(e, item.code)}
                            aria-label="展开 Agent 详情"
                            className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-xs text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-hover) hover:text-(--color-text-secondary)"
                            title="展开 Agent 详情"
                          >
                            <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="relative flex h-10 w-10 items-center justify-center">
                          <svg className="absolute h-10 w-10 -rotate-90" viewBox="0 0 48 48">
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
                          <span className={`relative text-xs font-bold ${scoreColor}`}>{item.score}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="relative flex h-10 w-10 items-center justify-center">
                          <svg className="absolute h-10 w-10 -rotate-90" viewBox="0 0 48 48">
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
                          <span className={`relative text-xs font-bold ${ruleScoreColor}`}>{item.rule_score ?? "--"}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="flex items-center justify-center">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.class}`}>
                            {badge.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs font-bold text-emerald-600 cursor-pointer" onClick={() => onSelectStock(item)}>
                        ¥{item.target_price?.toFixed(3) ?? "--"}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs font-extrabold text-(--color-text-primary) cursor-pointer" onClick={() => onSelectStock(item)}>
                        ¥{item.close_price.toFixed(3)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs font-bold text-red-500 cursor-pointer" onClick={() => onSelectStock(item)}>
                        ¥{item.stop_loss_price?.toFixed(3) ?? "--"}
                      </td>
                      <td className="px-2 py-2.5 cursor-pointer" onClick={() => onSelectStock(item)}>
                        <div className="flex items-center justify-center">
                          {boughtMap[item.code] ? (
                            <button
                              onClick={(e) => onUndoClick(e, item.code)}
                              aria-label={`撤销买入 ${item.name}`}
                              className="rounded-full border border-red-300/40 bg-red-100/40 px-3 py-1 text-[10px] font-bold text-red-700 shadow-sm backdrop-blur-md transition-all hover:bg-red-100/60 hover:shadow active:scale-95"
                            >
                              撤销
                            </button>
                          ) : (
                            <button
                              onClick={(e) => openBuyModal(e, item.code, item.name)}
                              aria-label={`买入 ${item.name}`}
                              className="group relative overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 px-3 py-1 text-[10px] font-bold text-white shadow-md shadow-emerald-200 transition-all hover:shadow-lg hover:shadow-emerald-200 hover:-translate-y-0.5 active:scale-95"
                            >
                              <span className="relative z-10">买入</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && item.agent_details && item.agent_details.length > 0 && (
                      <tr key={`${item.code}-agents`}>
                        <td colSpan={9} className="bg-(--color-bg-raised) px-4 py-2">
                          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) px-3 py-2">
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
                        <td colSpan={9} className="bg-(--color-bg-raised) px-4 py-2">
                          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) px-3 py-2">
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
        <BuyModal
          code={buyModal.code}
          name={buyModal.name}
          onConfirm={confirmBuy}
          onClose={() => setBuyModal(null)}
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-(--color-border) px-4 py-2.5">
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
