"use client";

import { useState, useEffect } from "react";
import { fetchRealtimePrice } from "@/lib/api";

export interface BuyModalProps {
  code: string;
  name: string;
  onConfirm: (price: number, quantity: number) => Promise<void>;
  onClose: () => void;
}

export default function BuyModal({ code, name, onConfirm, onClose }: BuyModalProps) {
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(100);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingPrice(true);
    fetchRealtimePrice(code)
      .then((data) => {
        if (!active) return;
        setPrice(data.price);
        setLoadingPrice(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadingPrice(false);
      });
    return () => { active = false; };
  }, [code]);

  const confirmBuy = async () => {
    if (!price || price <= 0 || quantity <= 0 || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(price, quantity);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div className="w-[360px] rounded-2xl bg-(--color-bg-card) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 id="buy-modal-title" className="text-base font-bold text-(--color-text-primary)">买入确认</h3>
        <div className="mt-1 text-sm text-(--color-text-secondary)">{name} ({code})</div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-(--color-text-secondary)">实时价</label>
            {loadingPrice ? (
              <div className="mt-1 h-8 animate-pulse rounded-lg bg-(--color-bg-hover)" />
            ) : (
              <input
                type="number"
                step={0.01}
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
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
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-[#3B82F6]"
            />
          </div>
          {!loadingPrice && price > 0 && (
            <div className="rounded-lg bg-(--color-bg-raised) px-3 py-2 text-xs text-(--color-text-secondary)">
              预计成本：¥{(price * quantity).toFixed(2)}
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-(--color-border) px-4 py-2 text-xs font-semibold text-(--color-text-secondary) hover:bg-(--color-bg-raised)">
            取消
          </button>
          <button
            onClick={confirmBuy}
            disabled={!price || price <= 0 || quantity <= 0 || submitting}
            className="rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "..." : "确认买入"}
          </button>
        </div>
      </div>
    </div>
  );
}
