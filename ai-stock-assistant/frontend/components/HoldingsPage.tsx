"use client";

import { useEffect, useState, useCallback } from "react";
import type { HoldingItem, HoldingListResponse, HoldingAdvice } from "@/lib/api";
import {
  fetchHoldings,
  updateHolding,
  sellHolding,
  deleteHolding,
  addPosition,
  fetchRealtimePrice,
  createSellOrder,
  updateSellOrderPrice,
  confirmSell,
  cancelSellOrder,
  fetchHoldingsAdvice,
  refreshHoldingsPrices,
} from "@/lib/api";

type Tab = "holding" | "sold";

export default function HoldingsPage({ onHoldingDeleted }: { onHoldingDeleted?: (code: string) => void }) {
  const [tab, setTab] = useState<Tab>("holding");
  const [holdings, setHoldings] = useState<HoldingListResponse | null>(null);
  const [adviceMap, setAdviceMap] = useState<Map<number, HoldingAdvice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editBp, setEditBp] = useState("");
  const [editSl, setEditSl] = useState("");
  const [editTp, setEditTp] = useState("");
  const [sellId, setSellId] = useState<number | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [addModal, setAddModal] = useState<{ h: HoldingItem; addPrice: number; addQty: number; loadingPrice: boolean } | null>(null);
  const [sellOrderModal, setSellOrderModal] = useState<{ h: HoldingItem; price: number; loadingPrice: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((status: Tab) => {
    setError("");
    setLoading(true);
    fetchHoldings(status)
      .then(setHoldings)
      .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); })
      .finally(() => setLoading(false));

    if (status === "holding") {
      fetchHoldingsAdvice()
        .then((res) => {
          const map = new Map<number, HoldingAdvice>();
          res.items.forEach((a) => map.set(a.holding_id, a));
          setAdviceMap(map);
        })
        .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); });
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (addModal) setAddModal(null);
        if (sellOrderModal) setSellOrderModal(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [addModal, sellOrderModal]);

  const handleSaveEdit = async (h: HoldingItem) => {
    setSubmitting(true);
    try {
      await updateHolding(h.id, {
        buy_price: editBp ? parseFloat(editBp) : undefined,
        stop_loss: editSl ? parseFloat(editSl) : undefined,
        take_profit: editTp ? parseFloat(editTp) : undefined,
      });
      setEditId(null);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    }
    setSubmitting(false);
  };

  const handleSell = async (h: HoldingItem) => {
    if (!sellPrice) return;
    setSubmitting(true);
    try {
      await sellHolding(h.id, parseFloat(sellPrice), "手动卖出");
      onHoldingDeleted?.(h.code);
      setSellId(null);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "卖出失败");
    }
    setSubmitting(false);
  };

  const handleDelete = async (h: HoldingItem) => {
    if (!confirm(`撤销 ${h.name} 的建仓？`)) return;
    try {
      await deleteHolding(h.id);
      onHoldingDeleted?.(h.code);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const openAddModal = async (h: HoldingItem) => {
    const suggested = Math.max(100, Math.round(h.quantity * 0.5 / 100) * 100);
    setAddModal({ h, addPrice: 0, addQty: suggested, loadingPrice: true });
    try {
      const data = await fetchRealtimePrice(h.code);
      setAddModal((prev) => prev && { ...prev, addPrice: data.price, loadingPrice: false });
    } catch (e) {
      setAddModal((prev) => prev && { ...prev, loadingPrice: false });
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const handleAddPosition = async () => {
    if (!addModal || !addModal.addPrice || !addModal.addQty) return;
    setSubmitting(true);
    try {
      await addPosition(addModal.h.id, { add_price: addModal.addPrice, add_quantity: addModal.addQty });
      setAddModal(null);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加仓失败");
    }
    setSubmitting(false);
  };

  const openSellOrderModal = async (h: HoldingItem) => {
    setSellOrderModal({ h, price: h.current_price, loadingPrice: true });
    try {
      const data = await fetchRealtimePrice(h.code);
      setSellOrderModal((prev) => prev && { ...prev, price: data.price, loadingPrice: false });
    } catch (e) {
      setSellOrderModal((prev) => prev && { ...prev, loadingPrice: false });
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const handleCreateSellOrder = async () => {
    if (!sellOrderModal) return;
    setSubmitting(true);
    try {
      await createSellOrder(sellOrderModal.h.id, sellOrderModal.price);
      setSellOrderModal(null);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "挂单失败");
    }
    setSubmitting(false);
  };

  const handleUpdateSellOrder = async (h: HoldingItem) => {
    setSubmitting(true);
    try {
      await updateSellOrderPrice(h.id, h.sell_price);
      setEditId(null);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新挂单失败");
    }
    setSubmitting(false);
  };

  const handleConfirmSell = async (h: HoldingItem) => {
    setSubmitting(true);
    try {
      await confirmSell(h.id);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认成交失败");
    }
    setSubmitting(false);
  };

  const handleCancelSell = async (h: HoldingItem) => {
    setSubmitting(true);
    try {
      await cancelSellOrder(h.id);
      load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消挂单失败");
    }
    setSubmitting(false);
  };

  const handleRefreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      await refreshHoldingsPrices();
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "刷新价格失败");
    }
    setRefreshingPrices(false);
  };

  const pnlColor = (h: HoldingItem) => {
    if (h.pnl_pct == null) return "text-(--color-text-secondary)";
    return h.pnl_pct >= 0 ? "text-red-500" : "text-green-600";
  };

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-(--color-text-primary)">我的持仓</h2>
          <p className="mt-0.5 text-xs text-(--color-text-secondary)">
            {holdings ? `共 ${holdings.count} 只` : "加载中..."}
            {holdings && tab === "holding" && ` · 总市值 ¥${holdings.total_market_value.toFixed(2)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tab === "holding" && (
            <button onClick={handleRefreshPrices} disabled={refreshingPrices}
              aria-label="刷新价格"
              className="flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-card) px-3 py-1.5 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-raised) hover:text-(--color-text-primary) disabled:opacity-50">
              <svg className={`h-3.5 w-3.5 ${refreshingPrices ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshingPrices ? "更新中..." : "刷新价格"}
            </button>
          )}
          {holdings && (
            <div className="text-right">
              {tab === "holding" && holdings.total_cost > 0 && (
                <>
                  <div className={`text-xl font-bold ${holdings.total_pnl >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {holdings.total_pnl >= 0 ? "+" : ""}{holdings.total_pnl_pct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-(--color-text-secondary)">
                    浮动盈亏 ¥{holdings.total_pnl.toFixed(2)}
                  </div>
                </>
              )}
              {tab === "sold" && (
                <>
                  <div className={`text-xl font-bold ${holdings.total_pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {holdings.total_pnl >= 0 ? "+" : ""}¥{holdings.total_pnl.toFixed(2)}
                  </div>
                  <div className="text-xs text-(--color-text-secondary)">
                    累计盈亏
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => load(tab)} className="font-medium underline hover:no-underline">重试</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-(--color-bg-hover) p-1 w-fit">
        <button onClick={() => setTab("holding")} className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${tab === "holding" ? "bg-(--color-bg-card) text-(--color-text-primary) shadow-sm" : "text-(--color-text-secondary) hover:text-(--color-text-primary)"}`}>持有中</button>
        <button onClick={() => setTab("sold")} className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${tab === "sold" ? "bg-(--color-bg-card) text-(--color-text-primary) shadow-sm" : "text-(--color-text-secondary) hover:text-(--color-text-primary)"}`}>已平仓</button>
      </div>

      {/* Content */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
          </div>
        ) : !holdings || holdings.items.length === 0 ? (
          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-12 text-center">
            <p className="text-sm text-(--color-text-secondary)">{tab === "holding" ? "暂无持仓" : "暂无平仓记录"}</p>
            {tab === "holding" && <p className="mt-1 text-xs text-(--color-text-tertiary)">在今日推荐列表中可以买入建仓</p>}
          </div>
        ) : (
          <div className="grid gap-4">
            {holdings.items.map((h) => (
              <div key={h.id} className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-bg-hover) text-sm font-bold text-(--color-text-secondary)">{h.name.charAt(0)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-(--color-text-primary)">{h.name}</h3>
                        <span className="text-xs text-(--color-text-tertiary)">{h.code}</span>
                        <span className="rounded-full bg-(--color-bg-hover) px-2 py-0.5 text-[10px] font-medium text-(--color-text-secondary)">{h.days_held ?? "-"} 天</span>
                        {h.status === "pending" && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">挂单中</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-(--color-text-secondary)">
                        {tab === "sold" ? (
                          <>
                            <span>持仓价 ¥{h.buy_price.toFixed(3)}</span>
                            <span>卖出价 ¥{h.current_price.toFixed(3)}</span>
                            <span>数量 {h.quantity} 股</span>
                            <span className={(h.pnl_amount ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>
                              盈亏 ¥{(h.pnl_amount ?? 0).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>持仓价 ¥{h.buy_price.toFixed(3)}</span>
                            <span>现价 ¥{h.current_price.toFixed(3)}</span>
                            <span>数量 {h.quantity} 股</span>
                          </>
                        )}
                        {h.status === "pending" && (
                          <span className="font-semibold text-amber-600">挂单价 ¥{h.sell_price.toFixed(3)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {tab === "holding" && h.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleConfirmSell(h)} disabled={submitting}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                        {submitting ? "..." : "确认成交"}
                      </button>
                      <button onClick={() => handleCancelSell(h)} disabled={submitting}
                        className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-text-secondary) hover:bg-(--color-bg-raised) disabled:opacity-50">
                        取消挂单
                      </button>
                    </div>
                  )}

                  {tab === "holding" && h.status === "holding" && (
                    <div className="flex items-center gap-2">
                      {sellId === h.id ? (
                        <div className="flex items-center gap-1">
                          <input type="number" step={0.001} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="卖出价" className="w-20 rounded border border-(--color-border) px-2 py-1 text-xs outline-none focus:border-(--color-accent)" />
                          <button onClick={() => handleSell(h)} disabled={submitting || !sellPrice} className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50">{submitting ? "..." : "确认"}</button>
                          <button onClick={() => setSellId(null)} className="rounded-lg border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-secondary) hover:bg-(--color-bg-raised)">取消</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => openAddModal(h)} aria-label="加仓" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-100">加仓</button>
                          <button onClick={() => openSellOrderModal(h)} aria-label="挂单卖出" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-100">挂单卖出</button>
                          <button onClick={() => { setSellId(h.id); setSellPrice(h.current_price.toFixed(3)); }} aria-label="立即卖出" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100">立即卖出</button>
                          <button onClick={() => handleDelete(h)} aria-label="撤销建仓" className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-bg-raised) hover:text-red-500">撤销</button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit buy_price */}
                <div className="mt-3 flex items-center gap-4 text-xs text-(--color-text-secondary)">
                  {editId === h.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1">
                        <span className="text-(--color-text-secondary)">购入价</span>
                        <input type="number" step={0.001} value={editBp} onChange={(e) => setEditBp(e.target.value)} className="w-28 rounded border border-(--color-border) px-2 py-1 text-xs outline-none focus:border-(--color-accent)" />
                      </label>
                      <button onClick={() => handleSaveEdit(h)} disabled={submitting} className="rounded bg-(--color-accent) px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{submitting ? "..." : "保存"}</button>
                      <button onClick={() => setEditId(null)} className="text-(--color-text-tertiary) hover:text-(--color-text-secondary)">取消</button>
                    </div>
                  ) : (
                    <>
                      <span>购入价 ¥{h.buy_price.toFixed(3)}</span>
                      {h.stop_loss > 0 && <span className="text-red-500">止损 ¥{h.stop_loss.toFixed(3)}</span>}
                      {h.take_profit > 0 && <span className="text-green-600">止盈 ¥{h.take_profit.toFixed(3)}</span>}
                      {tab === "holding" && h.status === "holding" && (
                        <button onClick={() => { setEditId(h.id); setEditBp(h.buy_price.toFixed(3)); setEditSl(""); setEditTp(""); }} aria-label="修改持仓信息" className="text-(--color-accent) hover:text-(--color-accent-hover)">修改</button>
                      )}
                      {tab === "holding" && h.status === "pending" && (
                        <button onClick={() => { setEditId(h.id); setEditBp(h.sell_price.toFixed(3)); }} aria-label="修改挂单价" className="text-amber-600 hover:text-amber-700">修改挂单价</button>
                      )}
                    </>
                  )}
                </div>

                {/* AI Advice */}
                {tab === "holding" && h.status === "holding" && adviceMap.has(h.id) && (() => {
                  const advice = adviceMap.get(h.id)!;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {advice.suggested_sell_price != null && advice.suggested_sell_price > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-600">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          建议卖出价 ¥{advice.suggested_sell_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Pending info */}
                {tab === "holding" && h.status === "pending" && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-(--color-text-secondary)">
                    <span>挂单 {h.updated_at.slice(0, 10)}</span>
                    {h.sell_price > 0 && h.buy_price > 0 && (
                      <span className={h.sell_price >= h.buy_price ? "text-red-500" : "text-green-600"}>
                        预计盈亏 {h.sell_price >= h.buy_price ? "+" : ""}
                        {((h.sell_price - h.buy_price) / h.buy_price * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}

                {/* Sold info */}
                {tab === "sold" && (
                  <div className="mt-3 text-xs text-(--color-text-secondary)">
                    买入 {h.buy_date} · 更新于 {h.updated_at.slice(0, 10)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Position Modal */}
      {addModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setAddModal(null)}
        >
          <div className="w-[380px] rounded-2xl bg-(--color-bg-card) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 id="add-modal-title" className="text-base font-bold text-(--color-text-primary)">加仓确认</h3>
            <div className="mt-1 text-sm text-(--color-text-secondary)">{addModal.h.name} ({addModal.h.code})</div>
            <div className="mt-3 flex gap-4 rounded-lg bg-(--color-bg-raised) px-3 py-2 text-xs text-(--color-text-secondary)">
              <span>当前 {addModal.h.quantity} 股</span>
              <span>均价 ¥{addModal.h.buy_price.toFixed(3)}</span>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-(--color-text-secondary)">加仓价格</label>
                {addModal.loadingPrice ? (
                  <div className="mt-1 h-8 animate-pulse rounded-lg bg-(--color-bg-hover)" />
                ) : (
                  <input type="number" step={0.001} value={addModal.addPrice} onChange={(e) => setAddModal({ ...addModal, addPrice: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-lg border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-(--color-accent)" />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-(--color-text-secondary)">加仓数量（股，100 的整数倍）</label>
                <input type="number" min={100} step={100} value={addModal.addQty} onChange={(e) => setAddModal({ ...addModal, addQty: parseInt(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-lg border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-(--color-accent)" />
                <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">建议加仓 {Math.max(100, Math.round(addModal.h.quantity * 0.5 / 100) * 100)} 股</p>
              </div>
              {!addModal.loadingPrice && addModal.addPrice > 0 && addModal.addQty > 0 && (
                <div className="rounded-lg bg-(--color-accent-light) px-3 py-2 text-xs text-[#4F46E5]">
                  加仓后：{(addModal.h.quantity + addModal.addQty)} 股，
                  均价 ¥{((addModal.h.buy_price * addModal.h.quantity + addModal.addPrice * addModal.addQty) / (addModal.h.quantity + addModal.addQty)).toFixed(3)}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAddModal(null)} className="rounded-lg border border-(--color-border) px-4 py-2 text-xs font-semibold text-(--color-text-secondary) hover:bg-(--color-bg-raised)">取消</button>
              <button onClick={handleAddPosition} disabled={!addModal.addPrice || addModal.addPrice <= 0 || addModal.addQty < 100}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {submitting ? "..." : "确认加仓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Order Modal */}
      {sellOrderModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sell-order-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setSellOrderModal(null)}
        >
          <div className="w-[380px] rounded-2xl bg-(--color-bg-card) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 id="sell-order-modal-title" className="text-base font-bold text-(--color-text-primary)">挂单卖出</h3>
            <div className="mt-1 text-sm text-(--color-text-secondary)">{sellOrderModal.h.name} ({sellOrderModal.h.code})</div>
            <div className="mt-3 flex gap-4 rounded-lg bg-(--color-bg-raised) px-3 py-2 text-xs text-(--color-text-secondary)">
              <span>持仓价 ¥{sellOrderModal.h.buy_price.toFixed(3)}</span>
              <span>现价 ¥{sellOrderModal.h.current_price.toFixed(3)}</span>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-(--color-text-secondary)">挂单卖出价</label>
                {sellOrderModal.loadingPrice ? (
                  <div className="mt-1 h-8 animate-pulse rounded-lg bg-(--color-bg-hover)" />
                ) : (
                  <input type="number" step={0.001} value={sellOrderModal.price}
                    onChange={(e) => setSellOrderModal({ ...sellOrderModal, price: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-lg border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-(--color-accent)" />
                )}
              </div>
              {!sellOrderModal.loadingPrice && sellOrderModal.price > 0 && (
                <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  sellOrderModal.price >= sellOrderModal.h.buy_price
                    ? "bg-red-50 text-red-600"
                    : "bg-green-50 text-green-600"
                }`}>
                  预计盈亏 {sellOrderModal.price >= sellOrderModal.h.buy_price ? "+" : ""}
                  {((sellOrderModal.price - sellOrderModal.h.buy_price) / sellOrderModal.h.buy_price * 100).toFixed(2)}%
                  （¥{((sellOrderModal.price - sellOrderModal.h.buy_price) * sellOrderModal.h.quantity).toFixed(2)}）
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSellOrderModal(null)} className="rounded-lg border border-(--color-border) px-4 py-2 text-xs font-semibold text-(--color-text-secondary) hover:bg-(--color-bg-raised)">取消</button>
              <button onClick={handleCreateSellOrder} disabled={!sellOrderModal.price || sellOrderModal.price <= 0}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                {submitting ? "..." : "确认挂单"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
