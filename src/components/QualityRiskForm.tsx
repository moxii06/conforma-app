"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; title: string };

const ORIGIN_LABELS: Record<string, string> = {
  reclamation: "Réclamation",
  resultat: "Résultat / décrochage",
  audit: "Audit",
  veille: "Veille réglementaire",
  autre: "Autre",
};

type Prefill = {
  risk?: string;
  origin?: string;
  courseId?: string;
  sourceNonConformityId?: string;
  triggerLabel?: string;
};

export function QualityRiskForm({ courses, prefill }: { courses: Course[]; prefill?: Prefill }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [risk, setRisk] = useState(prefill?.risk ?? "");
  const [origin, setOrigin] = useState(prefill?.origin ?? "autre");
  const [courseId, setCourseId] = useState(prefill?.courseId ?? "");
  const [probability, setProbability] = useState("moyenne");
  const [severity, setSeverity] = useState("moyenne");
  const [preventiveMeasure, setPreventiveMeasure] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!risk.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/qualiopi/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        risk,
        origin,
        courseId: courseId || undefined,
        sourceNonConformityId: prefill?.sourceNonConformityId,
        probability,
        severity,
        preventiveMeasure: preventiveMeasure || undefined,
        correctiveAction: correctiveAction || undefined,
        dueDate: dueDate || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }
    setOpen(false);
    setRisk("");
    setPreventiveMeasure("");
    setCorrectiveAction("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        {prefill?.triggerLabel ?? "+ Nouveau risque"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-[#EFEDE7] border border-line rounded-md p-3.5">
      <input
        value={risk}
        onChange={(e) => setRisk(e.target.value)}
        placeholder="Description du risque"
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
          {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {courses.length > 0 && (
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
            <option value="">Formation (optionnel)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Probabilité
          <select value={probability} onChange={(e) => setProbability(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
            <option value="faible">Faible</option>
            <option value="moyenne">Moyenne</option>
            <option value="elevee">Élevée</option>
          </select>
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Gravité
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
            <option value="faible">Faible</option>
            <option value="moyenne">Moyenne</option>
            <option value="elevee">Élevée</option>
          </select>
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Échéance
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
      </div>
      <textarea
        value={preventiveMeasure}
        onChange={(e) => setPreventiveMeasure(e.target.value)}
        placeholder="Mesure préventive"
        rows={2}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <textarea
        value={correctiveAction}
        onChange={(e) => setCorrectiveAction(e.target.value)}
        placeholder="Action corrective"
        rows={2}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <div className="flex items-center gap-2.5">
        <button
          type="submit"
          disabled={loading}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
