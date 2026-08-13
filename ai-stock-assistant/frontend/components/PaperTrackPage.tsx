"use client";

import { useEffect, useState } from "react";
import type { PaperTrackResponse } from "@/lib/api";
import { fetchPaperTrack, syncPaperTrack } from "@/lib/api";
import { GLASS_CARD } from "@/lib/glass";
import StatCard from "./StatCard";

const ENV_META: Record<string, { label: string; cls: string }> = {
  suitable: { label: "适宜", cls: "bg-green-100 text-green-700" },
  cautious: { label: "谨慎", cls: "bg-yellow-100 text-yellow-700" },
  unsuitable: { label: "较差", cls: "bg-red-100 text-red-700" },
};

export default function PaperTrackPage() {
  const [data, setData] = useState<PaperTrackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchPaperTrack()
      .then(setData)
      .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load() }, []);

  // 打开页面时自动同步一次（每天最多一次）
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    let already = false;
    try { already = localStorage.getItem("paper_synced_date") === today; } catch {}
    if (already) return;
    syncPaperTrack()
      .then(() => {
        try { localStorage.setItem("paper_synced_date", today); } catch {}
        load();
      })
      .catch(() => {});
  }, []);

  const envEntries = data ? Object.entries(data.stats.env_breakdown) : [];
  const envLabel = (key: string) => ENV_META[key]?.label || "未知";

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      <h2 className="text-lg font-bold text-(--color-text-primary)">纸面跟踪</h2>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">
        推荐票模拟买入与结算，不参与真实交易统计，用于验证系统在弱市中的表现
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={load} className="font-medium underline hover:no-underline">重试</button>
        </div>
      )}

      {/* Stats cards */}
      {data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="跟踪总数" value={String(data.stats.total)} />
            <StatCard label="在途观察" value={String(data.stats.open)} />
            <StatCard label="已结算" value={String(data.stats.closed)} />
            <StatCard label="胜率" value={`${data.stats.win_rate}%`} />
            <StatCard label="平均收益率" value={`${data.stats.avg_pnl_pct}%`} color={data.stats.avg_pnl_pct >= 0 ? "text-green-600" : "text-red-500"} />
          </div>

          {/* Environment breakdown */}
          {envEntries.length > 0 && (
            <div className={`${GLASS_CARD} mt-6 p-5`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-(--color-text-primary)">按推荐时大盘环境分组</h3>
                <span className="text-[10px] text-(--color-text-tertiary)">只统计已结算笔数</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {envEntries.map(([key, st]) => (
                  <div key={key} className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${ENV_META[key]?.cls || "bg-gray-100 text-gray-600"}`}>
                        {envLabel(key)}
                      </span>
                      <span className="text-[10px] text-(--color-text-tertiary)">{st.count} 笔</span>
                    </div>
                    <p className="mt-2 text-lg font-bold text-(--color-text-primary)">{st.win_rate}%</p>
                    <p className="text-[11px] text-(--color-text-secondary)">
                      胜率 {st.win}/{st.count} · 平均 <span className={st.avg_pnl_pct >= 0 ? "text-green-600" : "text-red-500"}>{st.avg_pnl_pct}%</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Track table */}
      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-(--color-text-secondary)">
            暂无跟踪记录，生成推荐后会自动跟踪
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-(--color-border-light)">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">推荐日期</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">股票</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">环境</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">模拟买入</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">最新价</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-(--color-text-secondary) uppercase">模拟盈亏</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id} className="border-b border-[#F9FAFB] transition-colors hover:bg-[#FAFBFC]">
                    <td className="px-6 py-3.5 text-xs font-mono text-(--color-text-secondary)">{t.recommend_date}</td>
                    <td className="px-6 py-3.5">
                      <div className="text-sm font-semibold text-(--color-text-primary)">{t.name}</div>
                      <div className="text-[10px] text-(--color-text-tertiary)">{t.code} · 第{t.rank}名</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${ENV_META[t.env_status]?.cls || "bg-gray-100 text-gray-600"}`}>
                        {envLabel(t.env_status)}
                        {t.env_score ? ` ${t.env_score}分` : ""}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="text-sm font-mono text-(--color-text-primary)">¥{t.entry_price.toFixed(3)}</div>
                      <div className="text-[10px] text-(--color-text-tertiary)">{t.entry_date}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="text-sm font-mono text-(--color-text-primary)">{t.latest_price ? `¥${t.latest_price.toFixed(3)}` : "—"}</div>
                      <div className="text-[10px] text-(--color-text-tertiary)">{t.latest_date || ""}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.status === "closed"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {t.status === "closed" ? `已结算${t.days_held ? ` ${t.days_held}日` : ""}` : "观察中"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {t.status === "closed" ? (
                        <span className={`text-sm font-semibold ${t.pnl_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-(--color-text-tertiary)">
                          {t.latest_price && t.entry_price > 0 ? (
                            <span className={t.latest_price >= t.entry_price ? "text-green-600" : "text-red-500"}>
                              {(t.latest_price - t.entry_price) / t.entry_price * 100 >= 0 ? "+" : ""}
                              {((t.latest_price - t.entry_price) / t.entry_price * 100).toFixed(2)}%
                            </span>
                          ) : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

