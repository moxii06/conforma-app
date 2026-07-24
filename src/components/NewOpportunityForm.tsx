"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LearnerCategoryFields, EMPTY_COMPANY_FIELDS, toCompanyInput, type CompanyFieldsState } from "@/components/LearnerCategoryFields";

type Contact = { id: string; firstName: string; lastName: string; email: string };
type Course = { id: string; title: string };

export function NewOpportunityForm({ contacts, courses = [] }: { contacts: Contact[]; courses?: Course[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(contacts.length > 0 ? "existing" : "new");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [courseOfInterestId, setCourseOfInterestId] = useState("");
  const [learnerCategory, setLearnerCategory] = useState("");
  const [company, setCompany] = useState<CompanyFieldsState>(EMPTY_COMPANY_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const amountCents = amount ? Math.round(parseFloat(amount) * 100) : undefined;
    const shared = {
      label,
      amountCents,
      courseOfInterestId: courseOfInterestId || undefined,
      learnerCategory: learnerCategory || undefined,
      company: toCompanyInput(learnerCategory, company),
    };
    const body =
      mode === "existing"
        ? { contactMode: "existing", contactId, ...shared }
        : { contactMode: "new", firstName, lastName, email, ...shared };

    const res = await fetch("/api/crm/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }

    setLabel("");
    setAmount("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setLearnerCategory("");
    setCompany(EMPTY_COMPANY_FIELDS);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft self-start"
      >
        + Nouveau prospect
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3 max-w-lg">
      <div className="flex items-center gap-2 text-[12.5px]">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`px-2.5 py-1 rounded-md ${mode === "existing" ? "bg-ink text-white" : "bg-[#E6E3DA] text-slate"}`}
          disabled={contacts.length === 0}
        >
          Contact existant
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`px-2.5 py-1 rounded-md ${mode === "new" ? "bg-ink text-white" : "bg-[#E6E3DA] text-slate"}`}
        >
          Nouveau contact
        </button>
      </div>

      {mode === "existing" ? (
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
        >
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName} — {c.email}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <input required placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
          <input required placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        </div>
      )}

      {/* Shares the 3-column grid above so "Montant" lines up under "Email"
          instead of drifting — two independent flex rows with different
          item counts don't share column boundaries. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 flex flex-col gap-0.5">
          <input
            required
            placeholder="Intitulé de l'opportunité"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
          <div className="text-[10.5px] text-slate px-0.5">Ce que ce prospect envisage — ex. « Formation Excel niveau 2 », « Bilan de compétences »</div>
        </div>
        <input
          placeholder="Montant (€)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal h-fit"
        />
      </div>

      {courses.length > 0 && (
        <select
          value={courseOfInterestId}
          onChange={(e) => setCourseOfInterestId(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
        >
          <option value="">Formation d&apos;intérêt (facultatif)</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}

      <LearnerCategoryFields category={learnerCategory} onCategoryChange={setLearnerCategory} company={company} onCompanyChange={setCompany} />

      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Créer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
