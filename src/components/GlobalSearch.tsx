"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Result = { id: string; label: string; sub?: string; href: string };
type Group = { key: string; label: string; results: Result[] };

// Recherche globale Ctrl/Cmd+K. Les groupes viennent maintenant du serveur
// (voir /api/search) au lieu d'être deux clés en dur : contacts, dossiers,
// sessions, formations, factures, devis, documents, prestataires. Ils sont
// aplatis en une seule liste pour la navigation au clavier, mais restent
// séparés visuellement pour qu'on voie d'un coup d'œil de quoi il s'agit —
// « Karim Benali » sous Contacts et sous Dossiers ne mènent pas au même
// endroit, et c'est l'en-tête de groupe qui le dit.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups]);

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
      setGroups([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timeoutRef.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups ?? []);
      }
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

  // Rang du premier résultat de chaque groupe dans la liste aplatie, pour que
  // les flèches traversent les groupes sans discontinuité. Précalculé plutôt
  // que retrouvé par indexOf à chaque ligne : deux tables différentes peuvent
  // très bien produire deux résultats portant le même identifiant.
  const debutDeGroupe = useMemo(() => {
    let n = 0;
    return groups.map((g) => {
      const debut = n;
      n += g.results.length;
      return debut;
    });
  }, [groups]);

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
          <div
            className="w-full max-w-lg bg-white border border-line rounded-card shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
              <Search size={16} className="text-slate shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Un nom, un titre, un n° de facture, une date…"
                className="flex-1 outline-none text-sm text-ink placeholder:text-slate"
              />
            </div>

            <div className="max-h-96 overflow-y-auto py-1.5">
              {query.trim().length < 2 && (
                <div className="px-4 py-6 text-[12.5px] text-slate text-center">
                  Tapez au moins 2 caractères.
                  <div className="mt-1.5 text-[11.5px]">
                    Une date (« 12/03 », « mars ») retrouve les sessions de cette période.
                  </div>
                </div>
              )}
              {query.trim().length >= 2 && !loading && flatResults.length === 0 && (
                <div className="px-4 py-6 text-[12.5px] text-slate text-center">Aucun résultat pour « {query.trim()} ».</div>
              )}

              {groups.map((group, groupIndex) => (
                <div key={group.key} className={groupIndex > 0 ? "mt-1" : ""}>
                  <div
                    className={`px-4 pb-1 pt-1.5 text-[10.5px] font-semibold text-slate uppercase tracking-wide ${
                      groupIndex > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    {group.label}
                  </div>
                  {group.results.map((r, i) => {
                    const index = debutDeGroupe[groupIndex] + i;
                    return (
                      <button
                        key={`${group.key}-${r.id}`}
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
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
