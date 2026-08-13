"use client";

import Image from "next/image";
import ThemeToggle from "./ThemeToggle";

type PageView = "home" | "holdings" | "trades" | "backtest" | "token-total" | "watch" | "paper";

const NAV_ITEMS: { key: PageView; label: string; icon: string }[] = [
  { key: "home", label: "首页 / 今日推荐", icon: "🏠" },
  { key: "holdings", label: "我的持仓", icon: "💼" },
  { key: "trades", label: "交易记录", icon: "📝" },
  { key: "paper", label: "纸面跟踪", icon: "🧪" },
  { key: "watch", label: "卖出回顾", icon: "👀" },
  { key: "backtest", label: "回测分析", icon: "📊" },
  { key: "token-total", label: "总计 Token", icon: "🪙" },
];

export default function Sidebar({
  currentPage,
  onNavigate,
}: {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}) {
  return (
    <aside className="fixed left-0 top-0 flex h-full w-[240px] flex-col border-r border-(--color-border) bg-(--color-bg-main) transition-colors">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-(--color-border) px-6 py-5">
        <Image src="/icon.png" alt="logo" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
        <div>
          <div className="text-sm font-extrabold text-(--color-text-primary)">AI 选股小助手</div>
          <div className="text-[11px] text-(--color-text-secondary)">智能股票分析助手</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-5">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPage === item.key;
          return (
            <button
              key={item.key}
              data-active={isActive}
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all
                ${isActive
                  ? "bg-(--color-accent-light) text-(--color-accent) shadow-sm"
                  : "text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary)"
                }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/60 text-base shadow-sm">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="border-t border-(--color-border) px-6 py-4">
        <ThemeToggle />
      </div>

      {/* Disclaimer */}
      <div className="border-t border-(--color-border) px-6 py-4">
        <p className="text-[11px] leading-relaxed text-(--color-text-tertiary)">
          数据仅供参考<br />
          不构成投资建议
        </p>
      </div>
    </aside>
  );
}
