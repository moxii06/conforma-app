"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FUNDING_ORIGIN_LABELS } from "@/lib/bpfCategories";

type Contact = { id: string; firstName: string; lastName: string };
type Dossier = { id: string; label: string };

const FUNDING_LABELS = Object.fromEntries(
  Object.entries(FUNDING_ORIGIN_LABELS).filter(([key]) => key !== "unset")
);

export function NewInvoiceForm({ contacts, dossiers }: { contacts: Contact[]; dossiers: Dossier[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [dossierId, setDossierId] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [fundingOrigin, setFundingOrigin] = useState("company");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/facturation/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        dossierId: dossierId || undefined,
        reference,
        amountCents: Math.round(parseFloat(amount || "0") * 100),
        fundingOrigin,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }

    setReference("");
    setAmount("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft self-start">
        + Nouvelle facture
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3 max-w-lg">
      <div className="flex gap-2">
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1">
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </select>
        <select value={dossierId} onChange={(e) => setDossierId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1">
          <option value="">Sans dossier lié</option>
          {dossiers.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input required placeholder="Référence (FAC-2026-001)" value={reference} onChange={(e) => setReference(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1" />
        <input required placeholder="Montant (€)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-32" />
      </div>
      <select value={fundingOrigin} onChange={(e) => setFundingOrigin(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
        {Object.entries(FUNDING_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <div className="text-[11px] text-slate">
        Transmission via le portail public (PPF) par défaut — connecteur Pennylane/Sellsy non branché (voir /integrations).
      </div>
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
