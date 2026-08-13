import type { TokenUsage } from "@/lib/api";

export default function TokenSummary({ usage }: { usage: TokenUsage | null }) {
  if (!usage || usage.total_tokens === 0) return null;

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) shadow-sm">
      <div className="flex items-center justify-center gap-6 px-5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-(--color-text-secondary)">Prompt</span>
          <span className="text-xs font-mono font-semibold text-(--color-text-primary)">{usage.prompt_tokens.toLocaleString()}</span>
        </div>
        <div className="h-3.5 w-px bg-(--color-border)" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-(--color-text-secondary)">Completion</span>
          <span className="text-xs font-mono font-semibold text-(--color-text-primary)">{usage.completion_tokens.toLocaleString()}</span>
        </div>
        <div className="h-3.5 w-px bg-(--color-border)" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-(--color-text-secondary)">总 Token</span>
          <span className="text-xs font-mono font-bold text-(--color-text-primary)">{usage.total_tokens.toLocaleString()}</span>
        </div>
        <div className="h-3.5 w-px bg-(--color-border)" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-(--color-text-secondary)">模型</span>
          <span className="text-[11px] font-mono text-(--color-text-secondary)">{usage.model}</span>
        </div>
        <div className="h-3.5 w-px bg-(--color-border)" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-(--color-text-secondary)">费用（估算）</span>
          <span className="text-xs font-mono font-bold text-(--color-accent)">¥{usage.cost_rmb.toFixed(4)}</span>
        </div>
      </div>
      <div className="border-t border-(--color-border) px-5 py-1.5 text-center text-[9px] text-(--color-text-tertiary)">
        价格根据当前模型费率自动计算
      </div>
    </div>
  );
}
