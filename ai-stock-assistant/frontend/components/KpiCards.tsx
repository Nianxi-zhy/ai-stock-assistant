"use client";

import { useEffect, useState } from "react";
import type { RecommendationReport } from "@/lib/api";
import { fetchTradeStats } from "@/lib/api";

function MiniSparkline({ color }: { color: string }) {
  return (
    <svg className="h-8 w-full" viewBox="0 0 100 28" preserveAspectRatio="none">
      <path
        d="M0,20 Q10,22 20,12 T40,10 T60,18 T80,8 T100,14"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
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
      value: `${report.count} 只`,
      color: "#3B82F6",
      bg: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "平均评分",
      value: `${avgScore.toFixed(1)} / 100`,
      color: "#22C55E",
      bg: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "交易胜率",
      value: winRate !== null ? `${winRate.toFixed(1)}%` : "--",
      color: "#8B5CF6",
      bg: "bg-purple-50",
      textColor: "text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-(--color-text-secondary)">{card.label}</p>
              <p className={`mt-1 text-2xl font-bold ${card.textColor}`}>
                {card.value}
              </p>
            </div>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bg}`}>
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: card.color }} />
            </div>
          </div>
          <div className="mt-2 h-8 w-full overflow-hidden">
            <MiniSparkline color={card.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
