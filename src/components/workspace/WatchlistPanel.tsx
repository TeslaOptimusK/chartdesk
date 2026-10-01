"use client";

import { useEffect, useMemo, useState } from "react";
import { LiveQuoteBadge } from "@/components/market/LiveQuoteBadge";
import { useWorkspace } from "@/lib/store";
import type { AssetClass, SymbolMeta, WatchlistSection } from "@/lib/types";
import { symbolMatchesQuery } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

interface Suggestion {
  ticker: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
}

function newId(): string {
  return `wl_${Math.random().toString(36).slice(2, 8)}`;
}

export function WatchlistPanel() {
  const symbols = useWorkspace((s) => s.symbols);
  const sections = useWorkspace((s) => s.watchlistSections);
  const activeSymbolId = useWorkspace((s) => s.activeSymbolId);
  const setActiveSymbol = useWorkspace((s) => s.setActiveSymbol);
  const setWatchlistSections = useWorkspace((s) => s.setWatchlistSections);
  const addSymbol = useWorkspace((s) => s.addSymbol);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingSection, setAddingSection] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [searchSectionId, setSearchSectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const byId = useMemo(() => new Map(symbols.map((symbol) => [symbol.id, symbol])), [symbols]);

  useEffect(() => {
    const q = query.trim();
    if (!searchSectionId || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetch(`/api/symbols?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data: { suggestions?: Suggestion[] }) => setSuggestions(data.suggestions ?? []))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query, searchSectionId]);

  const save = async (next: WatchlistSection[]) => {
    setWatchlistSections(next);
    await fetch("/api/symbols", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlistSections: next }),
    });
  };

  const addToSection = async (sectionId: string, symbol: SymbolMeta) => {
    const next = sections.map((section) =>
      section.id === sectionId && !section.symbolIds.includes(symbol.id)
        ? { ...section, symbolIds: [...section.symbolIds, symbol.id] }
        : section
    );
    setQuery("");
    setSuggestions([]);
    setSearchSectionId(null);
    await save(next);
  };

  const addSuggestion = async (sectionId: string, hit: Suggestion) => {
    const res = await fetch("/api/symbols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: hit.ticker,
        name: hit.name,
        exchange: hit.exchange,
        assetClass: hit.assetClass,
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { symbol?: SymbolMeta };
    if (!data.symbol) return;
    addSymbol(data.symbol);
    await addToSection(sectionId, data.symbol);
  };

  const removeFromSection = (sectionId: string, symbolId: string) => {
    const next = sections.map((section) =>
      section.id === sectionId
        ? { ...section, symbolIds: section.symbolIds.filter((id) => id !== symbolId) }
        : section
    );
    void save(next);
  };

  const createSection = () => {
    const name = sectionName.trim();
    if (!name) return;
    const id = newId();
    void save([...sections, { id, name, symbolIds: [] }]);
    setSectionName("");
    setAddingSection(false);
    setSearchSectionId(id);
    setQuery("");
  };

  const localHits = query.trim()
    ? symbols.filter((symbol) => symbolMatchesQuery(symbol, query)).slice(0, 8)
    : [];

  return (
    <div className="p-2" data-feature="watchlist">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-[var(--workspace-muted)]">그룹</span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-base leading-none text-[var(--workspace-fg)] hover:bg-white/10"
          title="섹션 추가"
          onClick={() => {
            setAddingSection((open) => !open);
            setSearchSectionId(null);
          }}
        >
          +
        </button>
      </div>
      {addingSection && (
        <form
          className="mb-2 flex gap-1 px-1"
          onSubmit={(ev) => {
            ev.preventDefault();
            createSection();
          }}
        >
          <input
            autoFocus
            value={sectionName}
            onChange={(ev) => setSectionName(ev.target.value)}
            placeholder="섹션 이름"
            className="h-7 min-w-0 flex-1 rounded border border-[var(--workspace-border)] bg-transparent px-2 text-xs"
          />
          <button type="submit" className="h-7 rounded px-2 text-[11px] text-emerald-300">
            추가
          </button>
        </form>
      )}
      {sections.map((section) => {
        const open = !collapsed[section.id];
        const searching = searchSectionId === section.id;
        return (
          <section key={section.id} className="mb-2" data-feature="watchlist.section">
            <div className="flex items-center gap-1 px-1 py-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-[var(--workspace-faint)]"
                onClick={() => setCollapsed((prev) => ({ ...prev, [section.id]: !prev[section.id] }))}
              >
                {open ? "▾" : "▸"} {section.name}
                <span className="ml-1 font-normal">{section.symbolIds.length}</span>
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-base leading-none text-[var(--workspace-fg)] hover:bg-white/10"
                title={`${section.name}에 종목 추가`}
                onClick={() => {
                  setSearchSectionId(searching ? null : section.id);
                  setQuery("");
                  setSuggestions([]);
                  setCollapsed((prev) => ({ ...prev, [section.id]: false }));
                }}
              >
                +
              </button>
            </div>
            {searching && (
              <form
                className="mb-1 px-1"
                onSubmit={(ev) => ev.preventDefault()}
              >
                <input
                  autoFocus
                  value={query}
                  onChange={(ev) => setQuery(ev.target.value)}
                  placeholder="티커 또는 종목명"
                  className="h-8 w-full rounded border border-[var(--workspace-border)] bg-transparent px-2 text-xs"
                />
                {query.trim().length === 1 && (
                  <div className="mt-1 px-1 text-[11px] text-[var(--workspace-faint)]">
                    두 글자 이상 입력하세요
                  </div>
                )}
                {query.trim().length >= 2 && (
                  <div className="mt-1 max-h-48 overflow-auto rounded border border-[var(--workspace-border)]">
                    {localHits.map((symbol) => {
                      const added = section.symbolIds.includes(symbol.id);
                      return (
                        <button
                          key={symbol.id}
                          type="button"
                          disabled={added}
                          className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] hover:bg-white/5 disabled:opacity-50"
                          onClick={() => void addToSection(section.id, symbol)}
                        >
                          <span>
                            <span className="font-medium text-[var(--workspace-fg)]">{symbol.ticker}</span>
                            <span className="ml-1 text-[var(--workspace-muted)]">
                              {symbol.nameKo} · {symbol.exchange}
                            </span>
                          </span>
                          <span className="text-[10px] text-[var(--workspace-faint)]">
                            {added ? "있음" : "추가"}
                          </span>
                        </button>
                      );
                    })}
                    {suggestions.map((hit) => (
                      <button
                        key={`${hit.exchange}-${hit.ticker}`}
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] hover:bg-white/5"
                        onClick={() => void addSuggestion(section.id, hit)}
                      >
                        <span>
                          <span className="font-medium text-[var(--workspace-fg)]">{hit.ticker}</span>
                          <span className="ml-1 text-[var(--workspace-muted)]">
                            {hit.name} · {hit.exchange}
                          </span>
                        </span>
                        <span className="text-[10px] text-emerald-300">추가</span>
                      </button>
                    ))}
                    {!localHits.length && !suggestions.length && (
                      <div className="px-2 py-2 text-[11px] text-[var(--workspace-faint)]">검색 결과 없음</div>
                    )}
                  </div>
                )}
              </form>
            )}
            {open &&
              section.symbolIds.map((id) => {
                const symbol = byId.get(id);
                if (!symbol) return null;
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5",
                      activeSymbolId === id && "bg-[var(--workspace-elevated)]"
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setActiveSymbol(id)}
                    >
                      <div className="truncate text-sm font-medium text-[var(--workspace-fg)]">
                        {symbol.ticker}
                      </div>
                      <div className="truncate text-[10px] text-[var(--workspace-muted)]">
                        {symbol.nameKo} · {symbol.exchange}
                      </div>
                    </button>
                    <LiveQuoteBadge symbolId={id} assetClass={symbol.assetClass} compact />
                    <button
                      type="button"
                      className="text-xs text-[var(--workspace-faint)] hover:text-rose-300"
                      title="섹션에서 빼기"
                      onClick={() => removeFromSection(section.id, id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
