"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddDpiaForm({ activities }: { activities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [processingActivityId, setProcessingActivityId] = useState(activities[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [riskLevel, setRiskLevel] = useState<"low" | "moderate" | "high">("moderate");
  const [status, setStatus] = useState<"required" | "in_progress" | "validated" | "not_required">("required");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!processingActivityId) {
      setError("Créez d'abord un traitement dans le registre.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/rgpd/dpia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processingActivityId, subject, riskLevel, status }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'enregistrement.");
      return;
    }

    setSubject("");
    setRiskLevel("moderate");
    setStatus("required");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2.5 flex-wrap">
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Traitement lié</label>
        <select value={processingActivityId} onChange={(e) => setProcessingActivityId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-52">
          {activities.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Objet de l&apos;analyse</label>
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-56" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Niveau de risque</label>
        <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          <option value="low">Faible</option>
          <option value="moderate">Modéré</option>
          <option value="high">Élevé</option>
        </select>
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Statut</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          <option value="required">Requise</option>
          <option value="in_progress">En cours</option>
          <option value="validated">Validée</option>
          <option value="not_required">Non requise</option>
        </select>
      </div>
      <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <div className="text-[12px] text-rust w-full">{error}</div>}
    </form>
  );
}
