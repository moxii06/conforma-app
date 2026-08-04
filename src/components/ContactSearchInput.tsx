"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export type ContactHit = { id: string; firstName: string; lastName: string; email: string };

// Recherche débouncée d'un contact existant (/api/contacts/search) avec
// liste de résultats cliquable — extraite de PersonPicker (audit P1 :
// « si je veux mettre un contact existant, il faut une barre de recherche
// ici ») pour remplacer les <select> natifs qui listaient TOUS les
// contacts : illisible dès quelques dizaines, intenable à 4000.
export function ContactSearchInput({
  onSelect,
  placeholder = "Rechercher un contact par nom ou email…",
}: {
  onSelect: (contact: ContactHit) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json().catch(() => []);
      setSearching(false);
      setResults(Array.isArray(data) ? data : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 border border-line rounded-md px-2.5 py-1.5 bg-white">
        <Search size={13} className="text-slate shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-[12.5px] text-ink focus:outline-none"
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-line rounded-md shadow-sm max-h-52 overflow-y-auto">
          {searching && <div className="px-2.5 py-1.5 text-[11.5px] text-slate">Recherche…</div>}
          {!searching && results.length === 0 && (
            <div className="px-2.5 py-1.5 text-[11.5px] text-slate">Aucun contact trouvé.</div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c);
                setQuery("");
                setResults([]);
              }}
              className="w-full text-left px-2.5 py-1.5 text-[12.5px] text-ink hover:bg-linen"
            >
              {c.firstName} {c.lastName} <span className="text-slate">{c.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
