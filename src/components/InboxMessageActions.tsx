"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { DialogShell, Field } from "@/components/DialogShell";
import {
  LearnerCategoryFields,
  EMPTY_COMPANY_FIELDS,
  toCompanyInput,
  type CompanyFieldsState,
} from "@/components/LearnerCategoryFields";

type Contact = { id: string; firstName: string; lastName: string; email: string };
export type CourseOption = { id: string; title: string };

const INPUT_CLASS =
  "w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

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
  subject,
  courses = [],
}: {
  messageId: string;
  contacts: Contact[];
  fromName?: string | null;
  subject?: string;
  courses?: CourseOption[];
}) {
  const router = useRouter();
  const suggested = splitName(fromName ?? null);
  const [mode, setMode] = useState<"idle" | "existing" | "new">("idle");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [firstName, setFirstName] = useState(suggested.firstName);
  const [lastName, setLastName] = useState(suggested.lastName);
  const [phone, setPhone] = useState("");
  // Audit P1 : « il faut que je puisse renseigner les mêmes informations que
  // si je le faisais depuis le CRM ». Le formulaire capturait prénom / nom /
  // téléphone / société ; il pose maintenant les mêmes champs que
  // NewOpportunityForm — catégorie d'apprenant, bloc entreprise complet,
  // opportunité — et crée la même chose : un contact ET son opportunité,
  // pour que le prospect atterrisse dans le pipeline au lieu de rester un
  // contact orphelin qu'il faut ressaisir côté CRM.
  const [learnerCategory, setLearnerCategory] = useState("");
  const [company, setCompany] = useState<CompanyFieldsState>(EMPTY_COMPANY_FIELDS);
  const [label, setLabel] = useState(subject ?? "");
  const [amount, setAmount] = useState("");
  const [courseOfInterestId, setCourseOfInterestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [prefilledByAi, setPrefilledByAi] = useState(false);

  async function send(body: object) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur inattendue.");
      return;
    }
    router.refresh();
  }

  function handleCreate() {
    if (!firstName.trim() || !lastName.trim()) return;
    const parsedAmount = Number.parseFloat(amount.replace(",", "."));
    send({
      action: "link-new",
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      learnerCategory: learnerCategory || undefined,
      company: toCompanyInput(learnerCategory, company),
      label: label.trim() || undefined,
      amountCents: Number.isFinite(parsedAmount) && parsedAmount > 0 ? Math.round(parsedAmount * 100) : undefined,
      courseOfInterestId: courseOfInterestId || undefined,
    });
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
    // L'IA ne renvoie qu'un nom de société : il alimente le bloc entreprise
    // sans présumer de la catégorie, que l'utilisateur choisit lui-même
    // (c'est elle qui décide si l'entreprise est enregistrée — voir
    // toCompanyInput).
    if (body.companyName) setCompany((c) => ({ ...c, name: body.companyName }));
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
      <DialogShell title="Nouveau prospect" onClose={() => setMode("idle")}>
        <div className="text-[11.5px] text-slate">
          L&apos;adresse email est reprise du message. Le prospect est créé dans le CRM avec son opportunité, à
          l&apos;étape « Prospect ».
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="tertiary" size="sm" onClick={handleAiExtract} disabled={aiLoading}>
            {aiLoading ? "…" : "Extraire avec l'IA"}
          </Button>
          {aiNotice ? (
            <span className="text-[11px] text-slate">{aiNotice}</span>
          ) : (
            !prefilledByAi &&
            (suggested.firstName || suggested.lastName) && (
              <span className="text-[11px] text-slate">Prénom et nom lus dans l&apos;email — vérifiez-les.</span>
            )
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Prénom">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT_CLASS} />
          </Field>
          <Field label="Nom">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT_CLASS} />
          </Field>
        </div>
        <Field label="Téléphone" hint="optionnel">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLASS} />
        </Field>

        <Field label="Catégorie d'apprenant">
          <LearnerCategoryFields
            category={learnerCategory}
            onCategoryChange={setLearnerCategory}
            company={company}
            onCompanyChange={setCompany}
          />
        </Field>

        <div className="border-t border-line pt-3 flex flex-col gap-2.5">
          <div className="text-[11px] text-slate uppercase tracking-wide">Opportunité</div>
          <Field label="Intitulé" hint="repris de l'objet du message">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT_CLASS} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Montant (€)" hint="optionnel">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Formation visée" hint="optionnel">
              <select
                value={courseOfInterestId}
                onChange={(e) => setCourseOfInterestId(e.target.value)}
                className={`${INPUT_CLASS} bg-white`}
              >
                <option value="">Formation visée — non renseignée</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {error && <div className="text-[11.5px] text-rust">{error}</div>}

        <div className="flex items-center gap-2.5 border-t border-line pt-3">
          <Button onClick={handleCreate} disabled={loading || !firstName.trim() || !lastName.trim()}>
            {loading ? "…" : "Créer le prospect"}
          </Button>
          <Button variant="tertiary" onClick={() => setMode("idle")} disabled={loading}>
            Annuler
          </Button>
        </div>
      </DialogShell>
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
