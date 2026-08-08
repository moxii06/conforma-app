"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client feedback: no way to call off a session (trainer pulls out, too few
// sign-ups) without either leaving it in a misleading VALIDATED/DRAFT state
// or deleting it outright. Reuses the same PATCH route as
// ValidateSessionButton — CANCELLED is just another SessionStatus.
//
// Et son inverse, pour la même raison que « Repasser en brouillon » existe à
// côté de « Valider » : annuler était sans retour. Une session annulée passe
// en lecture seule, ce qui faisait disparaître ce bouton avec le reste des
// contrôles — une annulation par erreur ne se rattrapait plus que dans la
// base. Le retour se fait en BROUILLON et jamais en « validée » : le statut
// d'avant l'annulation n'est stocké nulle part, et repartir en validé
// rouvrirait l'envoi des convocations sans que personne l'ait redemandé.
export function CancelSessionButton({ sessionId, isCancelled }: { sessionId: string; isCancelled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: "CANCELLED" | "DRAFT") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? (status === "CANCELLED" ? "Erreur lors de l'annulation." : "Erreur lors de la réactivation."));
      return;
    }
    router.refresh();
  }

  function handleCancel() {
    if (!confirm("Annuler cette session ? Les apprenants déjà invités ne seront pas notifiés automatiquement.")) return;
    setStatus("CANCELLED");
  }

  function handleReactivate() {
    if (
      !confirm(
        "Réactiver cette session ? Elle repasse en brouillon : il faudra la valider à nouveau pour envoyer des convocations.",
      )
    )
      return;
    setStatus("DRAFT");
  }

  return (
    <div className="flex flex-col gap-1.5">
      {isCancelled ? (
        <button
          type="button"
          onClick={handleReactivate}
          disabled={loading}
          className="text-[12.5px] font-medium text-slate hover:text-ink disabled:opacity-60 self-start"
        >
          {loading ? "…" : "Réactiver la session"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="text-[12.5px] font-medium text-rust hover:underline disabled:opacity-60 self-start"
        >
          {loading ? "…" : "Annuler la session"}
        </button>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
