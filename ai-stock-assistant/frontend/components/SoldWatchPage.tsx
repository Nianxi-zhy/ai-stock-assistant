"use client";

import { useEffect, useState } from "react";
import type { SoldWatchItem } from "@/lib/api";
import { fetchSoldWatch } from "@/lib/api";

export default function SoldWatchPage() {
  const [items, setItems] = useState<SoldWatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchSoldWatch()
      .then((res) => {
        setItems(res.items);
        setUpdatedAt(res.updated_at);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalDiff = items.reduce((s, i) => s + i.diff * i.quantity, 0);

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-(--color-text-primary)">卖出回顾</h2>
          <p className="mt-0.5 text-xs text-(--color-text-secondary)">
            {loading ? "加载中..." : `共 ${items.length} 只`}
            {!loading && items.length > 0 && ` · 卖出后累计变动 ${totalDiff >= 0 ? "+" : ""}¥${totalDiff.toFixed(2)}`}
          </p>
        </div>
        {updatedAt && (
          <span className="text-[10px] text-(--color-text-tertiary)">数据更新于 {updatedAt}</span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={load} className="font-medium underline hover:no-underline">重试</button>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-12 text-center">
            <p className="text-sm text-(--color-text-secondary)">暂无已平仓记录</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.code} className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${
                      item.status === "up"
                        ? "bg-green-50 text-green-600"
                        : item.status === "down"
                        ? "bg-red-50 text-red-600"
                        : "bg-(--color-bg-hover) text-(--color-text-secondary)"
                    }`}>
                      {item.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-(--color-text-primary)">{item.name}</h3>
                        <span className="text-xs text-(--color-text-tertiary)">{item.code}</span>
                        <span className="rounded-full bg-(--color-bg-hover) px-2 py-0.5 text-[10px] text-(--color-text-secondary)">{item.sell_date}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-(--color-text-secondary)">
                        <span>卖出价 <span className="font-medium text-(--color-text-primary)">¥{item.sell_price.toFixed(2)}</span></span>
                        <span>× {item.quantity} 股</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-(--color-text-secondary)">当前价</div>
                    <div className="text-lg font-bold text-(--color-text-primary)">¥{item.current_price.toFixed(2)}</div>
                    <div className={`flex items-center gap-1 text-xs font-semibold ${
                      item.status === "up" ? "text-green-600" : item.status === "down" ? "text-red-500" : "text-(--color-text-tertiary)"
                    }`}>
                      {item.status === "up" ? (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                      ) : item.status === "down" ? (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                      ) : null}
                      {item.diff >= 0 ? "+" : ""}¥{item.diff.toFixed(2)}（{item.diff_pct >= 0 ? "+" : ""}{item.diff_pct.toFixed(2)}%）
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-(--color-text-secondary)">
                  <span>卖出后</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                    item.status === "up"
                      ? "bg-green-50 text-green-600"
                      : item.status === "down"
                      ? "bg-red-50 text-red-500"
                      : "bg-(--color-bg-hover) text-(--color-text-tertiary)"
                  }`}>
                    {item.status === "up" ? "涨了" : item.status === "down" ? "跌了" : "持平"}
                    {" "}¥{(item.diff * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
