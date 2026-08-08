"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

/**
 * Traiter une ligne échue depuis le suivi RGPD : on CLÔTURE le dossier.
 *
 * On ne supprime rien, et c'est le point. La durée de conservation écoulée
 * n'ordonne pas d'effacer une inscription du BPF ni de retirer à un
 * apprenant son attestation — elle dit que le dossier n'a plus à vivre
 * dans les listes de travail. C'est exactement ce que fait la clôture (voir
 * lib/dossierArchive.ts), et c'est un geste que l'organisme connaît déjà :
 * même route, même effet, même réversibilité qu'ailleurs dans Jalon. Rien
 * de neuf à apprendre pour la personne qui range son registre.
 */
export function RgpdClotureDossierButton({ dossierId, apprenant }: { dossierId: string; apprenant: string }) {
  const router = useRouter();
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={async () => {
        setEnCours(true);
        const res = await fetch("/api/dossiers/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossierIds: [dossierId], archived: true }),
        });
        setEnCours(false);
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          toast.error(b.error ?? "L'action a échoué.");
          return;
        }
        toast.success(`Dossier de ${apprenant} clôturé. Aucune donnée supprimée.`);
        router.refresh();
      }}
      className="text-[11.5px] font-medium text-ink border border-line rounded px-2 py-0.5 hover:bg-paper whitespace-nowrap disabled:opacity-50"
      title="Le dossier sort des listes de travail. Le BPF, les attestations et la facturation ne changent pas."
    >
      {enCours ? "…" : "Clôturer"}
    </button>
  );
}
