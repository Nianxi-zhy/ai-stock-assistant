import type { RecommendationItem } from "@/lib/api";

const ACTION_STYLES: Record<string, { label: string; cardClass: string; badgeClass: string }> = {
  "买入": { label: "买入", cardClass: "card-glow-green", badgeClass: "bg-emerald-600 text-white" },
  "观望": { label: "观望", cardClass: "card-glow-amber", badgeClass: "bg-amber-600 text-white" },
  "卖出": { label: "卖出", cardClass: "card-glow-red", badgeClass: "bg-red-600 text-white" },
};

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className={`h-3 w-3 ${i < stars ? "text-amber-400" : "text-(--color-text-tertiary)"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  let color: string;
  if (score >= 70) color = "from-emerald-500 to-emerald-400";
  else if (score >= 50) color = "from-amber-500 to-amber-400";
  else color = "from-red-500 to-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--color-bg-hover)">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} animate-score-rise`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="w-7 text-right text-xs font-mono font-bold text-(--color-text-secondary)">
        {score}
      </span>
    </div>
  );
}

function RuleTags({ rules }: { rules: string[] }) {
  const short: Record<string, string> = {
    "exclude risky stock": "非风险",
    "price within configured mode": "价位合理",
    "close above MA20": "站上MA20",
    "MA20 above or near MA60": "MA20托底",
    "RSI in healthy range": "RSI健康",
    "MACD improving": "MACD向好",
    "volume above 20-day average": "量能达标",
  };
  const visible = rules.slice(0, 3);

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((r) => (
        <span
          key={r}
          className="rounded-md border border-(--color-border) bg-(--color-bg-raised) px-1.5 py-0.5 text-[10px] font-medium text-(--color-text-secondary)"
        >
          {short[r] || r}
        </span>
      ))}
      {rules.length > 3 && (
        <span className="rounded-md border border-(--color-border) bg-(--color-bg-raised) px-1.5 py-0.5 text-[10px] text-(--color-text-tertiary)">
          +{rules.length - 3}
        </span>
      )}
    </div>
  );
}

export default function StockCard({ item }: { item: RecommendationItem }) {
  const style = ACTION_STYLES[item.action] || ACTION_STYLES["观望"];
  const { token_usage: usage } = item;

  return (
    <div className={`rounded-xl border border-(--color-border) bg-(--color-bg-card) transition-all hover:border-(--color-border) hover:bg-(--color-bg-hover) ${style.cardClass}`}>
      <div className="p-4">
        {/* Row 1: Rank + Name + Action badge */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-(--color-bg-raised) text-[10px] font-mono font-bold text-(--color-text-tertiary)">
              {item.rank}
            </span>
            <h3 className="text-sm font-bold tracking-tight text-(--color-text-primary)">
              {item.name}
            </h3>
            <span className="text-[11px] font-mono text-(--color-text-tertiary)">
              {item.code}
            </span>
          </div>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${style.badgeClass}`}>
            {style.label}
          </span>
        </div>

        {/* Row 2: Price + Score + Stars */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-mono font-bold tracking-tight text-(--color-text-primary)">
              ¥<span className="tabular-nums">{item.close_price.toFixed(3)}</span>
            </span>
            {!item.passes_price_filter && (
              <span className="rounded border border-red-800/50 bg-red-900/30 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                超限
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-(--color-text-secondary)">
              <svg className="h-3 w-3 text-(--color-text-tertiary)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              规则 {item.rule_score}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-(--color-text-secondary)">
              <svg className="h-3 w-3 text-(--color-text-tertiary)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              {item.news_count}条
            </span>
          </div>
          <StarRating stars={item.stars} />
        </div>

        {/* Row 3: Score bar */}
        <div className="mt-2.5">
          <ScoreBar score={item.score} />
        </div>

        {/* Row 4: AI reason */}
        <p className="mt-2.5 text-xs leading-relaxed text-(--color-text-secondary)">
          {item.reason}
        </p>

        {/* Row 5: Tags */}
        <div className="mt-2.5">
          <RuleTags rules={item.passed_rules} />
        </div>

        {/* Row 6: Token usage (collapsed) */}
        {usage && (
          <div className="mt-2.5 border-t border-(--color-border) pt-2 text-[10px] font-mono tabular-nums text-(--color-text-tertiary)">
            Token {usage.total_tokens.toLocaleString()} &middot; ¥{usage.cost_rmb.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  );
}
