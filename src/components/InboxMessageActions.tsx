"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: string; firstName: string; lastName: string; email: string };

// Splits a "From" header display name ("Jean Dupont") into first/last name
// guesses to pre-fill the quick-create form — real parsing of what Gmail
// actually sent, not an AI extraction. The "Extraire avec l'IA" button
// below goes further (phone, company) using a real OpenAI call once a key
// is configured on /integrations.
function splitName(fromName: string | null): { firstName: string; lastName: string } {
  if (!fromName) return { firstName: "", lastName: "" };
  const parts = fromName.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function InboxMessageActions({
  messageId,
  contacts,
  fromName,
}: {
  messageId: string;
  contacts: Contact[];
  fromName?: string | null;
}) {
  const router = useRouter();
  const suggested = splitName(fromName ?? null);
  const [mode, setMode] = useState<"idle" | "existing" | "new">("idle");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [firstName, setFirstName] = useState(suggested.firstName);
  const [lastName, setLastName] = useState(suggested.lastName);
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [prefilledByAi, setPrefilledByAi] = useState(false);

  async function send(body: object) {
    setLoading(true);
    await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    router.refresh();
  }

  async function handleAiExtract() {
    setAiLoading(true);
    setAiNotice(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/ai-extract`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setAiLoading(false);
    if (!res.ok) {
      setAiNotice(body.error ?? "Erreur inattendue.");
      return;
    }
    if (body.firstName) setFirstName(body.firstName);
    if (body.lastName) setLastName(body.lastName);
    if (body.phone) setPhone(body.phone);
    if (body.companyName) setCompanyName(body.companyName);
    setPrefilledByAi(true);
    setAiNotice("Champs extraits par l'IA — vérifiez avant de créer.");
  }

  if (mode === "existing") {
    return (
      <ExistingContactPicker
        contacts={contacts}
        contactId={contactId}
        setContactId={setContactId}
        loading={loading}
        onLink={() => send({ action: "link", contactId })}
        onCancel={() => setMode("idle")}
      />
    );
  }

  if (mode === "new") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-20" />
          <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-20" />
          <input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-24" />
          <input placeholder="Société" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-28" />
          <button
            onClick={() => firstName && lastName && send({ action: "link-new", firstName, lastName, phone, companyName })}
            disabled={loading || !firstName || !lastName}
            className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
          >
            Créer
          </button>
          <button onClick={() => setMode("idle")} className="text-[12px] text-slate">Annuler</button>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={handleAiExtract} disabled={aiLoading} className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
            {aiLoading ? "…" : "Extraire avec l'IA"}
          </button>
          {!prefilledByAi && (suggested.firstName || suggested.lastName) && (
            <div className="text-[11px] text-slate">Prénom/nom pré-remplis depuis l&apos;email — vérifiez avant de créer.</div>
          )}
        </div>
        {aiNotice && <div className="text-[11px] text-slate">{aiNotice}</div>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <button onClick={() => setMode("new")} disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Nouveau prospect
      </button>
      {contacts.length > 0 && (
        <button onClick={() => setMode("existing")} disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
          Rattacher
        </button>
      )}
      <button onClick={() => send({ action: "discard" })} disabled={loading} className="text-[12px] text-rust hover:underline">
        Ignorer
      </button>
    </div>
  );
}

// Typeahead combobox, same shape as SearchableDossierSelect.tsx: the input
// doubles as the search box and the closed-state display, with matches in a
// floating panel right under it instead of a separate field above a native
// <select> — so the search lives inside the list itself, not above it.
function ExistingContactPicker({
  contacts,
  contactId,
  setContactId,
  loading,
  onLink,
  onCancel,
}: {
  contacts: Contact[];
  contactId: string;
  setContactId: (id: string) => void;
  loading: boolean;
  onLink: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = contacts.find((c) => c.id === contactId);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? contacts.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(normalizedQuery))
    : contacts;

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

  function pick(c: Contact) {
    setContactId(c.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="flex items-center gap-1.5">
      <div ref={containerRef} className="relative w-44">
        <input
          type="text"
          autoFocus
          value={open ? query : (selected ? `${selected.firstName} ${selected.lastName}` : "")}
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
              <div className="px-2.5 py-1.5 text-[11.5px] text-slate">Aucun résultat.</div>
            ) : (
              matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  className={`block w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-linen ${c.id === contactId ? "text-ink font-medium bg-linen" : "text-ink"}`}
                >
                  {c.firstName} {c.lastName}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        onClick={onLink}
        disabled={loading || !contactId}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        Rattacher
      </button>
      <button onClick={onCancel} className="text-[12px] text-slate">Annuler</button>
    </div>
  );
}
