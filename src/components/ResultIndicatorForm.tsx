"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; title: string };

const METRIC_LABELS: Record<string, string> = {
  elearning_completion: "Taux de complétion e-learning (calculé)",
  hot_evaluation_rate: "Taux d'évaluation à chaud réalisée (calculé)",
  manual: "Saisie manuelle (source externe, ex. enquête)",
};

function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function ResultIndicatorForm({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [computedFrom, setComputedFrom] = useState("elearning_completion");
  const [courseId, setCourseId] = useState("");
  const [periodStart, setPeriodStart] = useState(isoMonthsAgo(12));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [exclusions, setExclusions] = useState("0");
  const [manualDefinition, setManualDefinition] = useState("");
  const [manualFormula, setManualFormula] = useState("");
  const [manualTotalPopulation, setManualTotalPopulation] = useState("");
  const [manualRespondents, setManualRespondents] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/qualiopi/result-indicators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        courseId: courseId || undefined,
        periodStart,
        periodEnd,
        computedFrom,
        exclusions: Number(exclusions) || 0,
        manualDefinition: computedFrom === "manual" ? manualDefinition : undefined,
        manualFormula: computedFrom === "manual" ? manualFormula : undefined,
        manualTotalPopulation: computedFrom === "manual" ? Number(manualTotalPopulation) : undefined,
        manualRespondents: computedFrom === "manual" ? Number(manualRespondents) : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }
    setOpen(false);
    setLabel("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        + Nouvel indicateur
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-[#FAF8F2] border border-line rounded-md p-3.5">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nom de l'indicateur (ex. Taux de complétion e-learning 2025)"
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={computedFrom} onChange={(e) => setComputedFrom(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
          {Object.entries(METRIC_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {courses.length > 0 && (
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
            <option value="">Toutes formations</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Début
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Fin
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Exclusions
          <input type="number" min={0} value={exclusions} onChange={(e) => setExclusions(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink w-16" />
        </label>
      </div>

      {computedFrom === "manual" && (
        <div className="flex flex-col gap-2 pt-1 border-t border-line">
          <textarea
            value={manualDefinition}
            onChange={(e) => setManualDefinition(e.target.value)}
            placeholder="Définition de l'indicateur"
            rows={2}
            required
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
          />
          <input
            value={manualFormula}
            onChange={(e) => setManualFormula(e.target.value)}
            placeholder="Formule de calcul (ex. répondants satisfaits ÷ répondants)"
            required
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11.5px] text-slate flex items-center gap-1.5">
              Population totale
              <input type="number" min={0} value={manualTotalPopulation} onChange={(e) => setManualTotalPopulation(e.target.value)} required className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink w-20" />
            </label>
            <label className="text-[11.5px] text-slate flex items-center gap-1.5">
              Répondants
              <input type="number" min={0} value={manualRespondents} onChange={(e) => setManualRespondents(e.target.value)} required className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink w-20" />
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Calculer et enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
