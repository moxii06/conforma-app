"use client";

import { BulkListActionDialog, type BulkItem } from "@/components/BulkListActionDialog";

/**
 * « Archiver les prospects filtrés » (audit S7, P2), et son inverse depuis
 * l'onglet Archives.
 *
 * Archiver ne détruit rien : le contact sort des vues actives du CRM et se
 * retrouve dans « Archives », d'où il revient d'un clic. C'est pourquoi
 * l'avertissement le dit — une action réversible annoncée comme telle se
 * décide plus vite qu'une action dont on ignore la portée.
 */
export function BulkArchiveContactsButton({
  cibles,
  total,
  archiver,
}: {
  cibles: BulkItem[];
  total: number;
  archiver: boolean;
}) {
  return (
    <BulkListActionDialog
      declencheur={archiver ? "Archiver…" : "Réactiver…"}
      titre={archiver ? "Archiver des prospects" : "Réactiver des prospects"}
      avertissement={
        archiver
          ? "Les prospects cochés sortent du tableau et rejoignent l'onglet Archives. Rien n'est supprimé — leurs affaires, documents et échanges restent intacts, et un clic les ramène."
          : "Les prospects cochés reviennent dans le tableau actif."
      }
      cibles={cibles}
      total={total}
      ton={archiver ? "rust" : "ink"}
      libelleAction={(n) =>
        `${archiver ? "Archiver" : "Réactiver"} ${n.toLocaleString("fr-FR")} prospect${n > 1 ? "s" : ""}`
      }
      onConfirm={async (contactIds) => {
        const res = await fetch("/api/crm/contacts/bulk-archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds, archived: archiver }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          return { reussis: 0, echecs: [{ nom: "Requête refusée", message: b.error ?? `Erreur ${res.status}` }] };
        }
        const b = await res.json();
        return { reussis: b.modifies ?? 0, echecs: [] };
      }}
    />
  );
}
