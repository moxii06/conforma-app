"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveSessionButton({
  sessionId,
  archived,
  /** Preuves exigibles encore absentes. Non fourni = rien à vérifier (session à venir). */
  missingProofs,
}: {
  sessionId: string;
  archived: boolean;
  missingProofs?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Archiver sort la session des vues actives ET de la liste « à faire » du
    // tableau de bord : c'est l'acte qui dit « ce dossier est clos ». Le faire
    // avec des preuves manquantes, c'est les perdre de vue jusqu'à l'audit.
    // On n'interdit pas — un organisme peut avoir ses raisons, et une preuve
    // peut exister hors de Jalon — mais on ne laisse plus le geste passer
    // inaperçu.
    if (!archived && missingProofs && missingProofs > 0) {
      const ok = window.confirm(
        `${missingProofs} preuve${missingProofs > 1 ? "s" : ""} du parcours manque${missingProofs > 1 ? "nt" : ""} encore ` +
          `(recueil, contrat, convocation, émargement, évaluations ou attestation).\n\n` +
          `Archiver maintenant retire cette session des vues actives et du tableau de bord : ` +
          `personne ne vous les rappellera plus.\n\nArchiver quand même ?`,
      );
      if (!ok) return;
    }
    setLoading(true);
    await fetch(`/api/planning/sessions/${sessionId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-[12.5px] font-medium text-slate hover:text-ink disabled:opacity-60 self-start"
    >
      {loading ? "…" : archived ? "Désarchiver" : "Archiver"}
    </button>
  );
}
