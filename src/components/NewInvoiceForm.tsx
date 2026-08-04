"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceLinesEditor, toDraftLines, type EditableLine } from "@/components/InvoiceLinesEditor";
import { ContactSearchInput, type ContactHit } from "@/components/ContactSearchInput";
import { FUNDING_ORIGIN_LABELS } from "@/lib/bpfCategories";
import { Button } from "@/components/ui";

type Dossier = { id: string; label: string };

const FUNDING_LABELS = Object.fromEntries(
  Object.entries(FUNDING_ORIGIN_LABELS).filter(([key]) => key !== "unset")
);

// Pre-fills the standard 30-day payment term as an editable default rather
// than leaving the field blank — staff can shorten/extend it per client,
// but every invoice ends up with a real dueDate either way (needed for
// dashboardTasks.ts's automatic overdue detection).
function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// Le client de la facture se choisit par recherche serveur (audit P1),
// plus par un <select> chargeant tout le CRM.
export function NewInvoiceForm({ dossiers }: { dossiers: Dossier[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactHit | null>(null);
  const [dossierId, setDossierId] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [lignes, setLignes] = useState<EditableLine[]>([]);
  const [fundingOrigin, setFundingOrigin] = useState("company");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContact) {
      setError("Recherchez et sélectionnez un client d'abord.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/facturation/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: selectedContact.id,
        dossierId: dossierId || undefined,
        reference,
        description: description || undefined,
        lines: lignes.length > 0 ? toDraftLines(lignes) : undefined,
        amountCents: Math.round(parseFloat(amount || "0") * 100),
        fundingOrigin,
        dueDate: dueDate || undefined,
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
      <Button size="sm" onClick={() => setOpen(true)} className="self-start">
        + Nouvelle facture
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3 max-w-lg">
      {/* Both rows share the same 2-column grid so "Montant" lines up under
          "Sans dossier lié" instead of drifting — two independent flex rows
          don't share column boundaries even with matching item counts. */}
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        {selectedContact ? (
          <div className="flex items-center gap-2 border border-line rounded-md px-2.5 py-1.5 bg-mist text-[12.5px]">
            <span className="text-ink font-medium">
              {selectedContact.firstName} {selectedContact.lastName}
            </span>
            <button type="button" onClick={() => setSelectedContact(null)} className="ml-auto text-[11.5px] text-slate hover:text-ink underline">
              Changer
            </button>
          </div>
        ) : (
          <ContactSearchInput onSelect={setSelectedContact} placeholder="Rechercher le client…" />
        )}
        <select value={dossierId} onChange={(e) => setDossierId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          <option value="">Sans dossier lié</option>
          {dossiers.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <input required placeholder="Référence (FAC-2026-001)" value={reference} onChange={(e) => setReference(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        {/* Désignation de la prestation : mention obligatoire de l'article
            242 nonies A. À défaut, le PDF reprend la formation du dossier. */}
        <input placeholder="Objet (à défaut : la formation du dossier)" value={description} onChange={(e) => setDescription(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
        <input required placeholder="Montant (€)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <select value={fundingOrigin} onChange={(e) => setFundingOrigin(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          {Object.entries(FUNDING_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10.5px] text-slate uppercase tracking-wide">Échéance</label>
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </div>
      </div>
      {/* Ce que Jalon fait vraiment, et ce qu'il ne fait pas. La version
          précédente annonçait « transmission via le portail public (PPF) par
          défaut » alors qu'aucun connecteur n'émet : un organisme pouvait
          croire sa facture transmise. */}
      <div className="text-[11px] text-slate leading-relaxed">
        Jalon établit et archive la facture.{" "}
        <span className="text-ink">
          Sa transmission au format électronique réglementaire reste à faire depuis votre plateforme agréée
        </span>
        {/* Espace explicite : sans lui, JSX avale l'espace entre la balise
            fermante et le tiret, et la phrase se lit « agréée— Jalon ». */}
        {" — "}
        Jalon n&apos;est pas une plateforme de dématérialisation.
      </div>
      <InvoiceLinesEditor
        lignes={lignes}
        onChange={setLignes}
        amountCents={Math.round(parseFloat(amount || "0") * 100)}
      />
      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "…" : "Créer"}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
