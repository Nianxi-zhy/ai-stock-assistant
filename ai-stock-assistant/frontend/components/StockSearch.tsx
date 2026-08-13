"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { StockSearchResult } from "@/lib/api";
import { searchStocks } from "@/lib/api";

export default function StockSearch({
  onSelect,
}: {
  onSelect: (code: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchStocks(query.trim());
        setResults(data);
        setOpen(data.length > 0);
        setHighlightIdx(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Ctrl+K / Cmd+K to focus
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  const doSubmit = useCallback(
    (code: string, name: string) => {
      setQuery("");
      setResults([]);
      setOpen(false);
      onSelect(code, name);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  const handleSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    if (results.length > 0) {
      doSubmit(results[0].code, results[0].name);
    } else {
      doSubmit(q, "");
    }
  }, [query, results, doSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && open && results.length > 0) {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp" && open && results.length > 0) {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && open && results.length > 0) {
        doSubmit(results[highlightIdx].code, results[highlightIdx].name);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center rounded-lg border border-(--color-border) bg-(--color-bg-raised) transition-all duration-200 focus-within:border-[#3B82F6] focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]">
        <svg
          className="ml-2.5 h-4 w-4 text-(--color-text-tertiary) transition-colors duration-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="搜索股票代码或名称..."
          className="min-w-[180px] border-0 bg-transparent px-2 py-1.5 text-[13px] text-(--color-text-primary) outline-none placeholder:text-(--color-text-tertiary) focus:ring-0"
        />
        {loading && (
          <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--color-border) border-t-[#3B82F6]" />
        )}
        {!loading && query.trim() && (
          <button
            onClick={handleSubmit}
            className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-(--color-text-tertiary) transition-colors hover:bg-(--color-accent) hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!loading && !query && (
          <span className="mr-2.5 text-[11px] text-(--color-text-tertiary)">Ctrl+K</span>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-card) shadow-lg">
          {results.map((item, i) => (
            <button
              key={item.code}
              onClick={() => doSubmit(item.code, item.name)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                i === highlightIdx ? "bg-(--color-accent-light)" : "hover:bg-(--color-bg-raised)"
              }`}
            >
              <span className="font-mono text-xs font-semibold text-(--color-accent)">
                {item.code}
              </span>
              <span className="flex-1 text-(--color-text-primary)">{item.name}</span>
              <svg
                className="h-3.5 w-3.5 text-[#D1D5DB]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
