"use client";

import { useEffect, useRef, useState } from "react";

export type DossierOption = { id: string; label: string };

// A typeahead combobox over an already-loaded dossier list — client-side
// filtering only (no network round-trip), which is enough for a library
// action generating one document at a time. Distinct from SearchInput.tsx's
// URL-driven, server-refetching search, which fits a paginated list page
// but would be the wrong tool for a small inline picker like this one.
export function SearchableDossierSelect({
  dossiers,
  value,
  onChange,
}: {
  dossiers: DossierOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = dossiers.find((d) => d.id === value);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? dossiers.filter((d) => d.label.toLowerCase().includes(normalizedQuery)).slice(0, 30)
    : dossiers.slice(0, 30);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(d: DossierOption) {
    onChange(d.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : (selected?.label ?? "")}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder="Rechercher un apprenant…"
        className="w-full border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-line rounded-md shadow-md py-1">
          {matches.length === 0 ? (
            <div className="px-2.5 py-1.5 text-[11.5px] text-slate">Aucun apprenant trouvé.</div>
          ) : (
            matches.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d)}
                className={`block w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-linen ${d.id === value ? "text-ink font-medium bg-linen" : "text-ink"}`}
              >
                {d.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
