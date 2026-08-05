"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceLinesEditor, toDraftLines, type EditableLine } from "@/components/InvoiceLinesEditor";
import { ContactSearchInput, type ContactHit } from "@/components/ContactSearchInput";
import { DossierSearchSelect } from "@/components/DossierSearchSelect";
import { Field, DialogShell } from "@/components/DialogShell";
import { Button } from "@/components/ui";

// Retour client : « quand je clique sur nouveau devis, il faut que cela
// fasse une nouvelle boîte de dialogue dans laquelle je peux éditer et
// modifier ». Le formulaire s'ouvrait en place dans la page, avec ses trois
// champs répartis dans une grille à deux colonnes — d'où le décalage
// visible et le débordement de la liste des dossiers.
export function NewQuoteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactHit | null>(null);
  const [dossierId, setDossierId] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [lignes, setLignes] = useState<EditableLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setSelectedContact(null);
    setDossierId("");
    setReference("");
    setAmount("");
    setDescription("");
    setLignes([]);
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

    const res = await fetch("/api/facturation/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: selectedContact.id,
        dossierId: dossierId || undefined,
        reference,
        description: description || undefined,
        lines: lignes.length > 0 ? toDraftLines(lignes) : undefined,
        amountCents: Math.round(parseFloat(amount || "0") * 100),
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
        + Nouveau devis
      </Button>
    );
  }

  function close() {
    setOpen(false);
    reset();
  }

  return (
    <DialogShell title="Nouveau devis" onClose={close}>
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

        {/* Les dossiers proposés sont ceux DU CLIENT choisi, chargés à la
            demande — voir DossierSearchSelect. */}
        <Field label="Dossier de formation" hint="facultatif">
          {selectedContact ? (
            <DossierSearchSelect contactId={selectedContact.id} value={dossierId} onChange={setDossierId} />
          ) : (
            <div className="text-[12px] text-slate py-1.5">Choisissez d&apos;abord le client.</div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Référence">
            <input
              required
              placeholder="DEV-2026-001"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
            />
          </Field>
          <Field label="Montant (€)">
            <input
              required
              placeholder="1 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
            />
          </Field>
        </div>

        {/* Désignation de la prestation : obligatoire sur le document émis,
            et à défaut le PDF reprend le titre de la formation du dossier. */}
        <Field label="Objet" hint="à défaut : la formation du dossier">
          <input
            placeholder="Formation Excel — niveau 2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
          />
        </Field>

        <InvoiceLinesEditor lignes={lignes} onChange={setLignes} amountCents={Math.round(parseFloat(amount || "0") * 100)} />

        <div className="flex items-center gap-2.5 pt-1">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "…" : "Créer le devis"}
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
