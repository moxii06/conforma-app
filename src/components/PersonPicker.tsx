"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";

export type LearnerInput =
  | { contactId: string }
  | { firstName: string; lastName: string; email: string; phone?: string };

type ContactHit = { id: string; firstName: string; lastName: string; email: string };

// Shared "pick a person" building block for enrolling learners: search
// among contacts already in the CRM, or type a brand-new one in on the
// spot. Used both inline during course creation (CreateCourseForm) and
// after the fact from the course catalog (EnrollLearnerPanel) — the two
// callers differ only in what they do with the result (accumulate locally
// vs. POST immediately), so that's left to onSelect.
export function PersonPicker({ onSelect }: { onSelect: (input: LearnerInput, label: string) => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (mode !== "existing" || query.trim().length < 2) {
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
  }, [query, mode]);

  function pickExisting(c: ContactHit) {
    onSelect({ contactId: c.id }, `${c.firstName} ${c.lastName}`);
    setQuery("");
    setResults([]);
  }

  function submitNew() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    onSelect(
      { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() || undefined },
      `${firstName.trim()} ${lastName.trim()}`
    );
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-[11.5px]">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`px-2 py-1 rounded-md font-medium ${mode === "existing" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
        >
          Apprenant existant
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`px-2 py-1 rounded-md font-medium ${mode === "new" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
        >
          Nouvel apprenant
        </button>
      </div>

      {mode === "existing" ? (
        <div className="relative">
          <div className="flex items-center gap-1.5 border border-line rounded-md px-2.5 py-1.5 bg-white">
            <Search size={13} className="text-slate shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un contact par nom ou email…"
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
                  onClick={() => pickExisting(c)}
                  className="w-full text-left px-2.5 py-1.5 text-[12.5px] text-ink hover:bg-[#FAF8F2]"
                >
                  {c.firstName} {c.lastName} <span className="text-slate">{c.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // A plain div, not a <form> — this renders inside CreateCourseForm's
        // own outer <form>, and HTML doesn't allow nested forms (the browser
        // silently drops/mis-parses them, which used to make this control a
        // no-op click). Enter-to-submit is wired manually instead.
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Prénom"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Nom"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Email"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Téléphone (optionnel)"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
          <button
            type="button"
            onClick={submitNew}
            className="self-start inline-flex items-center gap-1.5 bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft"
          >
            <UserPlus size={13} /> Ajouter cet apprenant
          </button>
        </div>
      )}
    </div>
  );
}
