"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The finding's lifecycle buttons + the bridge to the existing continuous-
// improvement register: "Créer une action d'amélioration" posts a
// QualityRisk with origin "audit" (a value that origin enum already had,
// waiting for exactly this) so the NC feeds the indicator-30-32 loop
// without a duplicate action model.
export function QualiopiFindingActions({
  findingId,
  status,
  indicatorNumber,
  description,
  correctiveAction,
  severity,
}: {
  findingId: string;
  status: string;
  indicatorNumber: number;
  description: string;
  correctiveAction: string | null;
  severity: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closureComment, setClosureComment] = useState("");
  const [riskCreated, setRiskCreated] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    await fetch(`/api/qualiopi/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    setClosing(false);
    router.refresh();
  }

  async function createImprovementAction() {
    setLoading(true);
    const res = await fetch("/api/qualiopi/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        risk: `NC ${severity} audit — indicateur ${indicatorNumber} : ${description}`,
        origin: "audit",
        probability: "moyenne",
        severity: severity === "majeure" ? "elevee" : "moyenne",
        correctiveAction: correctiveAction || undefined,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setRiskCreated(true);
      router.refresh();
    }
  }

  if (closing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          autoFocus
          value={closureComment}
          onChange={(e) => setClosureComment(e.target.value)}
          placeholder="Commentaire de l'auditeur (facultatif)"
          className="bg-white border border-line rounded-md px-2 py-1 text-[11.5px] text-ink outline-none focus:border-seal flex-1 min-w-[220px]"
        />
        <button
          onClick={() => patch({ action: "solder", closureComment: closureComment || undefined })}
          disabled={loading}
          className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
        >
          {loading ? "…" : "Confirmer le solde"}
        </button>
        <button onClick={() => setClosing(false)} className="text-[11px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {status === "ouverte" && (
        <button
          onClick={() => patch({ action: "lever" })}
          disabled={loading}
          className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
          title="L'organisme certificateur a accepté l'action corrective"
        >
          {loading ? "…" : "Marquer l'écart levé"}
        </button>
      )}
      {status === "levee" && (
        <button
          onClick={() => setClosing(true)}
          disabled={loading}
          className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
          title="L'audit suivant a constaté que l'action est toujours en œuvre"
        >
          Solder l&apos;écart (audit suivant)
        </button>
      )}
      {status !== "ouverte" && (
        <button onClick={() => patch({ action: "rouvrir" })} disabled={loading} className="text-[11px] text-slate hover:text-ink disabled:opacity-60">
          Rouvrir
        </button>
      )}
      {riskCreated ? (
        <span className="text-[11px] text-sage">Ajoutée au plan d&apos;amélioration ✓</span>
      ) : (
        <button
          onClick={createImprovementAction}
          disabled={loading}
          className="text-[11px] text-slate hover:text-ink disabled:opacity-60"
          title="Crée une entrée au registre des risques / plan d'amélioration continue (origine : audit)"
        >
          + Créer une action d&apos;amélioration
        </button>
      )}
    </div>
  );
}
