"use client";

import type { MarketEnvironmentResponse } from "@/lib/api";

export default function MarketWarning({ env }: { env: MarketEnvironmentResponse }) {
  if (env.status === "suitable") return null;

  const isBlocking = env.status === "unsuitable";

  return (
    <div className={`mb-4 overflow-hidden rounded-2xl border shadow-sm ${
      isBlocking
        ? "border-red-200 bg-red-50"
        : "border-amber-200 bg-amber-50"
    }`}>
      <div className="flex items-start gap-3 px-5 py-4">
        {isBlocking ? (
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        ) : (
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-bold ${isBlocking ? "text-red-800" : "text-amber-800"}`}>
              {isBlocking ? "今日不宜买入" : "市场环境谨慎"}
            </h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isBlocking
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              评分 {env.score}/100
            </span>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${isBlocking ? "text-red-600" : "text-amber-600"}`}>
            {env.summary}
          </p>
          {env.indices.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {env.indices.map((idx) => (
                <span key={idx.code} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                  isBlocking ? "bg-red-100/50 text-red-600" : "bg-amber-100/50 text-amber-700"
                }`}>
                  {idx.name} {idx.price.toFixed(2)}
                  <span className={idx.change_pct >= 0 ? "text-green-600" : "text-red-500"}>
                    {idx.change_pct >= 0 ? "+" : ""}{idx.change_pct.toFixed(2)}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
