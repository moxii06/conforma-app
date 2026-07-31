"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Deux formes selon l'état de la réponse.
 *
 * Tant que personne n'a répondu (`current === null`), c'est une question
 * posée là où le chiffre est faux : un OF qui ne fait pas d'apprentissage
 * voit cinq indicateurs qu'il ne peut pas couvrir peser sur son score, sans
 * savoir pourquoi. Une fois répondu, ça redevient une ligne discrète et
 * réversible — se tromper ici ne doit jamais être un cul-de-sac.
 */
export function ApprenticeshipScopeControl({
  current,
  affectedCount,
}: {
  current: boolean | null;
  affectedCount: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function save(value: boolean) {
    setSaving(true);
    await fetch("/api/organization/apprenticeship", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliversApprenticeship: value }),
    });
    setSaving(false);
    router.refresh();
  }

  if (current === null) {
    return (
      <div className="bg-linen border border-line rounded-card px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
        <div className="text-[12.5px] text-ink leading-relaxed max-w-xl">
          <span className="font-semibold">Faites-vous de l&apos;apprentissage ?</span>{" "}
          {/* {" "} explicite : l'espace en tête de la ligne suivante est
              avalé par JSX, ce qui donnait « 5indicateurs ». */}
          {affectedCount}{" "}
          indicateurs du référentiel ne concernent que les actions de formation par apprentissage. Si vous
          n&apos;en réalisez pas, ils comptent aujourd&apos;hui contre vous dans votre score sans que vous
          puissiez rien y faire.
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
          >
            Non, jamais
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="bg-white border border-line text-ink text-[12px] font-medium rounded-md px-3 py-1.5 hover:border-ink-soft disabled:opacity-60"
          >
            Oui
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-[11.5px] text-slate">
      {current
        ? `Actions de formation par apprentissage incluses — les ${affectedCount} indicateurs correspondants sont comptés.`
        : `${affectedCount} indicateurs réservés à l'apprentissage sont exclus de votre score.`}{" "}
      <button
        onClick={() => save(!current)}
        disabled={saving}
        className="font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {current ? "Nous n'en faisons pas" : "Nous en faisons"}
      </button>
    </div>
  );
}
