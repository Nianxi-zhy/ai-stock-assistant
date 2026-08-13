"use client";

import { useEffect, useState } from "react";
import type { RecommendationReport } from "@/lib/api";
import { fetchTradeStats } from "@/lib/api";

function WavyLine({ color }: { color: string }) {
  return (
    <svg className="h-5 w-full" viewBox="0 0 120 20" preserveAspectRatio="none">
      <path
        d="M0,10 Q10,4 20,10 T40,10 T60,10 T80,10 T100,10 T120,10"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export default function KpiCards({ report }: { report: RecommendationReport }) {
  const [winRate, setWinRate] = useState<number | null>(null);

  useEffect(() => {
    fetchTradeStats()
      .then((s) => setWinRate(s.win_rate))
      .catch(() => {});
  }, []);

  const avgScore =
    report.recommendations.length > 0
      ? report.recommendations.reduce((s, r) => s + r.score, 0) /
        report.recommendations.length
      : 0;

  const cards = [
    {
      label: "今日推荐股票",
      value: `${report.count}`,
      unit: "只",
      sub: "",
      color: "#A7D8FF",
      valueColor: "text-blue-600",
    },
    {
      label: "平均评分",
      value: `${avgScore.toFixed(1)}`,
      unit: "/100",
      sub: "",
      color: "#A7E8D4",
      valueColor: "text-green-600",
    },
    {
      label: "交易胜率",
      value: winRate !== null ? `${winRate.toFixed(1)}` : "--",
      unit: "%",
      sub: "",
      color: "#D8C4FF",
      valueColor: "text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="kpi-card relative overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-(--color-text-secondary)">{card.label}</p>
              <p className={`mt-1 text-2xl font-extrabold ${card.valueColor}`}>
                {card.value}
                <span className="ml-0.5 text-sm font-bold text-(--color-text-tertiary)">{card.unit}</span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-(--color-text-tertiary)">
                {card.sub}
              </p>
            </div>
            {/* 颜色来自运行时 card.color，无法用静态 Tailwind 类表达，保留 style */}
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: `${card.color}40` }}
            >
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: card.color }} />
            </div>
          </div>
          <div className="mt-3">
            <WavyLine color={card.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
