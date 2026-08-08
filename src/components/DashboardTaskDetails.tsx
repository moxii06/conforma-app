"use client";

import { useState } from "react";

/**
 * Le détail d'une famille résumée du widget « à faire », replié.
 *
 * Pourquoi pas `ShowMoreToggle`, qui fait pourtant la même mécanique : son
 * libellé « + N autres » compte un RELIQUAT, ce qui reste sous les cinq
 * premières lignes déjà affichées (widgets Réclamations et Signalements).
 * Ici, la ligne de résumé n'affiche aucune ligne de détail — elle affiche
 * un nombre. Lui accoler « + 12 autres » après « 12 attestations à
 * envoyer » se lisait comme vingt-quatre, alors que le dépliage n'en révèle
 * jamais que douze. Il n'y a pas d'« autres » à compter : il y a un détail
 * à ouvrir, et c'est ce que le bouton doit dire.
 */
export function DashboardTaskDetails({ children }: { children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  if (ouvert) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setOuvert(true)}
      className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink shrink-0"
    >
      Voir le détail
    </button>
  );
}
