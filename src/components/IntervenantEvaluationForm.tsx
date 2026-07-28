"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL = "text-[10.5px] font-semibold text-slate uppercase tracking-wide";
const FIELD = "bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

// Inline "évaluer" form for one intervenant row of the Évaluations tab —
// the written trace the pilot's own 2022 NC majeure (indicator 21) was
// about. developmentPlan is the indicator-22 half: what professional
// development is planned, not just how the person performed.
export function IntervenantEvaluationForm({ userId, subcontractorId }: { userId?: string; subcontractorId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [evaluatedAt, setEvaluatedAt] = useState(new Date().toISOString().slice(0, 10));
  const [strengths, setStrengths] = useState("");
  const [developmentPlan, setDevelopmentPlan] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/team/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        subcontractorId,
        evaluatedAt,
        strengths: strengths || undefined,
        developmentPlan: developmentPlan || undefined,
        comment: comment || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setOpen(false);
    setStrengths("");
    setDevelopmentPlan("");
    setComment("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink shrink-0">
        Évaluer
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-linen border border-line rounded-md p-3 w-full">
      <div className="flex flex-col gap-1 max-w-[180px]">
        <label className={LABEL}>Date de l&apos;évaluation</label>
        <input required type="date" value={evaluatedAt} onChange={(e) => setEvaluatedAt(e.target.value)} className={FIELD} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Compétences et points forts observés</label>
        <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="ex. maîtrise du sujet, retours apprenants très positifs" className={FIELD} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Développement des compétences prévu (formations, certifications…)</label>
        <input value={developmentPlan} onChange={(e) => setDevelopmentPlan(e.target.value)} placeholder="ex. formation de formateurs prévue au T4" className={FIELD} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Commentaire — facultatif</label>
        <input value={comment} onChange={(e) => setComment(e.target.value)} className={FIELD} />
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer l'évaluation"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
