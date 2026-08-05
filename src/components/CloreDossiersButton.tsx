"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

/**
 * Clôturer une promotion, ou rouvrir ce qui a été clos.
 *
 * Le libellé porte le nombre : « Clôturer les 30 dossiers » dit ce qui va
 * se passer, là où « Clôturer » laisserait croire qu'on ferme la session.
 * Ce sont deux objets distincts — la session s'archive de son côté, dans le
 * planning.
 */
export function CloreDossiersButton({
  sessionId,
  nombre,
  dejaClos,
}: {
  sessionId: string;
  /** Dossiers concernés par l'action (ouverts, ou clos si l'on rouvre). */
  nombre: number;
  dejaClos: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);

  if (nombre === 0) return null;

  async function agir() {
    setEnCours(true);
    const res = await fetch("/api/dossiers/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, archived: !dejaClos }),
    });
    setEnCours(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b.error ?? "L'action a échoué.");
      return;
    }
    const b = await res.json();
    toast.success(
      dejaClos
        ? `${b.nombre} dossier${b.nombre > 1 ? "s" : ""} rouvert${b.nombre > 1 ? "s" : ""}.`
        : `${b.nombre} dossier${b.nombre > 1 ? "s" : ""} clôturé${b.nombre > 1 ? "s" : ""}.`
    );
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={agir}
      disabled={enCours}
      className="text-[12px] text-slate hover:text-ink underline decoration-line whitespace-nowrap disabled:opacity-50"
      title={
        dejaClos
          ? "Les dossiers reviennent dans les listes de travail."
          : "Les dossiers sortent des listes de travail et ne déclenchent plus de relance. Le bilan pédagogique et l'accès des apprenants ne changent pas."
      }
    >
      {enCours
        ? "…"
        : dejaClos
          ? `Rouvrir les ${nombre} dossiers`
          : `Clôturer les ${nombre} dossiers`}
    </button>
  );
}
