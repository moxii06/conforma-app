"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceLinesEditor, toDraftLines, type EditableLine } from "@/components/InvoiceLinesEditor";
import { ContactSearchInput, type ContactHit } from "@/components/ContactSearchInput";
import { Field, DialogShell } from "@/components/DialogShell";
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

// Même refonte que NewQuoteForm : boîte de dialogue éditable au lieu d'un
// formulaire déplié dans la page, et champs étiquetés au lieu de simples
// textes de substitution.
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

  function reset() {
    setSelectedContact(null);
    setDossierId("");
    setReference("");
    setAmount("");
    setDescription("");
    setLignes([]);
    setFundingOrigin("company");
    setDueDate(defaultDueDate());
    setError(null);
  }

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

    reset();
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

  function close() {
    setOpen(false);
    reset();
  }

  const inputClass =
    "w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal";

  return (
    <DialogShell title="Nouvelle facture" onClose={close}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Client">
          {selectedContact ? (
            <div className="flex items-center gap-2 border border-line rounded-md px-2.5 py-1.5 bg-mist text-[12.5px]">
              <span className="text-ink font-medium">
                {selectedContact.firstName} {selectedContact.lastName}
              </span>
              <span className="text-slate truncate">{selectedContact.email}</span>
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="ml-auto shrink-0 text-[11.5px] text-slate hover:text-ink underline"
              >
                Changer
              </button>
            </div>
          ) : (
            <ContactSearchInput onSelect={setSelectedContact} placeholder="Rechercher le client…" />
          )}
        </Field>

        <Field label="Dossier de formation" hint="facultatif">
          {/* min-w-0 : sans ça un <select> se dimensionne sur son option la
              plus longue et déborde de la boîte au lieu de s'y adapter. */}
          <select value={dossierId} onChange={(e) => setDossierId(e.target.value)} className={inputClass}>
            <option value="">Sans dossier lié</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Audit P1 : laissée vide, Jalon attribue le numéro suivant de la
              séquence de l'organisme — c'est ce qui garantit une suite sans
              trou. Reste saisissable pour les cas particuliers (avoir,
              reprise d'une numérotation externe sur une facture précise). */}
          <Field label="Référence" hint="vide = numéro suivant">
            <input
              placeholder="Automatique"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Montant (€)">
            <input
              required
              placeholder="1 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        </div>

        {/* Désignation de la prestation : mention obligatoire de l'article
            242 nonies A. À défaut, le PDF reprend la formation du dossier. */}
        <Field label="Objet" hint="à défaut : la formation du dossier">
          <input
            placeholder="Formation Excel — niveau 2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Origine du financement">
            <select value={fundingOrigin} onChange={(e) => setFundingOrigin(e.target.value)} className={inputClass}>
              {Object.entries(FUNDING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Échéance">
            <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {/* Ce que Jalon fait vraiment, et ce qu'il ne fait pas. La version
            précédente annonçait « transmission via le portail public (PPF) par
            défaut » alors qu'aucun connecteur n'émet : un organisme pouvait
            croire sa facture transmise. */}
        <div className="text-[11px] text-slate leading-relaxed border-t border-line pt-2.5">
          Jalon établit et archive la facture.{" "}
          <span className="text-ink">
            Sa transmission au format électronique réglementaire reste à faire depuis votre plateforme agréée
          </span>
          {" — "}
          Jalon n&apos;est pas une plateforme de dématérialisation.
        </div>

        <InvoiceLinesEditor lignes={lignes} onChange={setLignes} amountCents={Math.round(parseFloat(amount || "0") * 100)} />

        <div className="flex items-center gap-2.5 pt-1">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "…" : "Créer la facture"}
          </Button>
          <Button type="button" variant="tertiary" size="sm" onClick={close}>
            Annuler
          </Button>
        </div>
        {error && <div className="text-[12px] text-rust">{error}</div>}
      </form>
    </DialogShell>
  );
}
