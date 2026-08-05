"use client";

import { BulkListActionDialog, type BulkItem } from "@/components/BulkListActionDialog";
import { statusLabels } from "@/components/DocStatusSelect";
import type { DocStatus } from "@prisma/client";

/**
 * « Marquer payées les factures filtrées » (audit S7, P2).
 *
 * Le geste que faisait défaut : un OPCO vire une fois pour trente
 * dossiers, et il fallait ouvrir trente menus déroulants. Le lot suit le
 * FILTRE en cours — on isole d'abord les factures concernées avec la
 * recherche, le statut ou la période, puis on applique.
 *
 * L'avertissement dit ce que l'action fait ET ce qu'elle ne fait pas :
 * marquer payé déclare un état, ce n'est pas saisir un encaissement. La
 * même distinction que sur le menu déroulant unitaire — voir
 * lib/invoiceStatus.ts.
 */
export function BulkInvoiceStatusButton({
  cibles,
  total,
  statut,
}: {
  cibles: BulkItem[];
  total: number;
  statut: DocStatus;
}) {
  const libelle = statusLabels("invoices")[statut];

  return (
    <BulkListActionDialog
      declencheur={`Marquer « ${libelle} »…`}
      titre={`Marquer « ${libelle} »`}
      avertissement={
        statut === "PAID"
          ? "Les factures cochées passent à « Payée » et l'affaire commerciale correspondante est marquée terminée. Cela déclare un état : le montant encaissé, lui, se saisit facture par facture avec « Enregistrer un règlement »."
          : `Les factures cochées passent à « ${libelle} ». Décochez celles qui ne doivent pas changer.`
      }
      cibles={cibles}
      total={total}
      libelleAction={(n) => `Marquer ${n.toLocaleString("fr-FR")} facture${n > 1 ? "s" : ""}`}
      onConfirm={async (ids) => {
        const res = await fetch("/api/facturation/invoices/bulk-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, status: statut }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          return { reussis: 0, echecs: [{ nom: "Requête refusée", message: b.error ?? `Erreur ${res.status}` }] };
        }
        const b = await res.json();
        return { reussis: b.modifiees ?? 0, echecs: (b.echecs ?? []).map((e: { reference: string; message: string }) => ({ nom: e.reference, message: e.message })) };
      }}
    />
  );
}
