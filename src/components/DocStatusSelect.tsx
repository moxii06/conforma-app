"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocStatus } from "@prisma/client";

// DRAFT reads differently per document kind — client feedback: a devis or
// facture that's been created but not sent yet should say so plainly
// ("Devis/Facture à envoyer"), not the generic, easy-to-miss "Brouillon".
export function statusLabels(kind: "quotes" | "invoices"): Record<DocStatus, string> {
  return {
    DRAFT: kind === "quotes" ? "Devis à envoyer" : "Facture à envoyer",
    SENT: "Envoyé",
    SIGNED: "Signé",
    PAID: "Payé",
    OVERDUE: "En retard",
  };
}

// Seule source de vérité pour la couleur d'un statut de devis/facture —
// dupliquée à l'identique dans facturation/page.tsx et crm/contacts/[id]/
// page.tsx avant ce partage (audit S6, cohérence des couleurs) ; les deux
// copies auraient pu diverger sans que rien ne le signale.
export const DOC_STATUS_TONE: Record<DocStatus, "good" | "warn" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  SENT: "warn",
  SIGNED: "good",
  PAID: "good",
  OVERDUE: "danger",
};

export function DocStatusSelect({ kind, id, status }: { kind: "quotes" | "invoices"; id: string; status: DocStatus }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const labels = statusLabels(kind);

  // PAID et OVERDUE n'ont aucune traduction dans le modèle d'un devis : seuls
  // SENT et SIGNED déclenchent quelque chose (marquerDevisEnvoye/
  // marquerDevisSigne, /api/facturation/quotes/[id]) et un devis n'a même pas
  // de date d'échéance pour justifier « En retard ». Les proposer ici, c'est
  // laisser l'écriture en base réussir sans que rien ne se passe. On garde
  // la valeur courante si un devis existant les porte déjà (donnée
  // historique) pour ne pas afficher un menu qui ne correspond pas à l'état
  // réel.
  const hiddenForQuotes: DocStatus[] = ["PAID", "OVERDUE"];
  const options = (Object.entries(labels) as [DocStatus, string][]).filter(
    ([value]) => kind === "invoices" || value === status || !hiddenForQuotes.includes(value)
  );

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    await fetch(`/api/facturation/${kind}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.target.value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={saving}
      className="text-[11.5px] border border-line rounded px-1.5 py-0.5 text-ink outline-none focus:border-seal disabled:opacity-60"
    >
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
