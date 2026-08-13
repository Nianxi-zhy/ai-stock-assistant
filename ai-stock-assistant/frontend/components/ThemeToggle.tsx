"use client";

import { useState, useEffect } from "react";
import { Moon, Sun, Sparkles } from "lucide-react";

type ThemeMode = "light" | "dark" | "cute";

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "cute"];

const THEME_META: Record<
  ThemeMode,
  { icon: React.ReactNode; label: string; next: ThemeMode }
> = {
  light: {
    icon: <Sun size={16} className="text-[#F59E0B]" />,
    label: "亮色",
    next: "dark",
  },
  dark: {
    icon: <Moon size={16} className="text-[#A5B4FC]" />,
    label: "暗色",
    next: "cute",
  },
  cute: {
    icon: <Sparkles size={16} className="text-[#FF6B8A]" />,
    label: "可爱",
    next: "light",
  },
};

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
    root.classList.remove("theme-cute");
  } else if (mode === "cute") {
    root.classList.remove("dark");
    root.classList.add("theme-cute");
  } else {
    root.classList.remove("dark", "theme-cute");
  }
  localStorage.setItem("theme", mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("theme") as ThemeMode | null;
    if (saved && THEME_CYCLE.includes(saved)) {
      setMode(saved);
      applyTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setMode("dark");
      applyTheme("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = THEME_META[mode].next;
    setMode(next);
    applyTheme(next);
  };

  const meta = THEME_META[mode];

  return (
    <button
      onClick={toggleTheme}
      title={`当前：${meta.label}，点击切换`}
      className="flex items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-card) px-3 py-2 text-sm font-medium transition-all hover:bg-(--color-bg-hover) active:scale-95"
    >
      {meta.icon}
      <span>{meta.label}</span>
    </button>
  );
}
