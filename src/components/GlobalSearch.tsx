"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Result = { id: string; label: string; sub?: string; href: string };
type SearchResponse = { contacts: Result[]; courses: Result[] };

// Cmd/Ctrl+K global search (Phase 4 §A1) — deliberately scoped to contacts
// and course titles, see /api/search's own comment for why. Groups are
// flattened into one list for keyboard navigation (arrows/Enter) but kept
// visually separated so a result's type is obvious at a glance.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse>({ contacts: [], courses: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatResults = useMemo(() => [...data.contacts, ...data.courses], [data]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else {
      setQuery("");
      setData({ contacts: [], courses: [] });
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setData({ contacts: [], courses: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    timeoutRef.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    }, 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flatResults.length]);

  function goTo(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[activeIndex]) {
      goTo(flatResults[activeIndex].href);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-white/60 hover:bg-ink-soft hover:text-white w-full text-left"
        aria-label="Recherche"
      >
        <Search size={15} />
        <span className="text-[12.5px] flex-1">Rechercher…</span>
        <span className="text-[10px] border border-white/20 rounded px-1 py-0.5">Ctrl K</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-24" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg bg-white border border-line rounded-card shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
              <Search size={16} className="text-slate shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Chercher un contact, une formation…"
                className="flex-1 outline-none text-sm text-ink placeholder:text-slate"
              />
            </div>

            <div className="max-h-96 overflow-y-auto py-1.5">
              {query.trim().length < 2 && (
                <div className="px-4 py-6 text-[12.5px] text-slate text-center">Tapez au moins 2 caractères.</div>
              )}
              {query.trim().length >= 2 && !loading && flatResults.length === 0 && (
                <div className="px-4 py-6 text-[12.5px] text-slate text-center">Aucun résultat pour « {query.trim()} ».</div>
              )}

              {data.contacts.length > 0 && (
                <div className="mb-1">
                  <div className="px-4 pb-1 pt-1.5 text-[10.5px] font-semibold text-slate uppercase tracking-wide">Contacts</div>
                  {data.contacts.map((r) => {
                    const index = flatResults.indexOf(r);
                    return (
                      <button
                        key={r.id}
                        onClick={() => goTo(r.href)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex flex-col w-full text-left px-4 py-2 ${index === activeIndex ? "bg-mist" : ""}`}
                      >
                        <span className="text-[13px] text-ink font-medium">{r.label}</span>
                        {r.sub && <span className="text-[11.5px] text-slate">{r.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {data.courses.length > 0 && (
                <div>
                  <div className="px-4 pb-1 pt-1.5 text-[10.5px] font-semibold text-slate uppercase tracking-wide border-t border-line">
                    Formations
                  </div>
                  {data.courses.map((r) => {
                    const index = flatResults.indexOf(r);
                    return (
                      <button
                        key={r.id}
                        onClick={() => goTo(r.href)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex w-full text-left px-4 py-2 ${index === activeIndex ? "bg-mist" : ""}`}
                      >
                        <span className="text-[13px] text-ink font-medium">{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
