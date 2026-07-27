"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL = "text-[10.5px] font-semibold text-slate uppercase tracking-wide";
const FIELD = "bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

// One certifier "Demande d'amélioration" sheet = one finding: the gap on
// ONE indicator, its severity, then the OF's response plan (immediate
// action / root cause / corrective action + implementation date). The
// response fields are optional at creation — the real-world flow is
// "record the gaps the day of the audit, fill the response plan within
// the following days".
export function QualiopiFindingForm({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [indicatorNumber, setIndicatorNumber] = useState("");
  const [severity, setSeverity] = useState<"mineure" | "majeure">("mineure");
  const [description, setDescription] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [implementedAt, setImplementedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/qualiopi/audits/${auditId}/findings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        indicatorNumber: parseInt(indicatorNumber, 10),
        severity,
        description,
        immediateAction: immediateAction || undefined,
        rootCause: rootCause || undefined,
        correctiveAction: correctiveAction || undefined,
        implementedAt: implementedAt || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setOpen(false);
    setIndicatorNumber("");
    setDescription("");
    setImmediateAction("");
    setRootCause("");
    setCorrectiveAction("");
    setImplementedAt("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
        + Ajouter une non-conformité
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-linen border border-line rounded-md p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Indicateur n°</label>
          <input required type="number" min={1} max={40} value={indicatorNumber} onChange={(e) => setIndicatorNumber(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Gravité</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as "mineure" | "majeure")} className={FIELD}>
            <option value="mineure">Non-conformité mineure</option>
            <option value="majeure">Non-conformité majeure</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Écart constaté par l&apos;auditeur</label>
        <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${FIELD} resize-none`} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Action immédiate (curative) — facultatif</label>
        <input value={immediateAction} onChange={(e) => setImmediateAction(e.target.value)} className={FIELD} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Analyse des causes — facultatif</label>
        <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} className={FIELD} />
      </div>
      <div className="grid grid-cols-[1fr_150px] gap-2.5">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Action corrective (éviter la récurrence) — facultatif</label>
          <input value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Mise en œuvre le</label>
          <input type="date" value={implementedAt} onChange={(e) => setImplementedAt(e.target.value)} className={FIELD} />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Ajouter"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
