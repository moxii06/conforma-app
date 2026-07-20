"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddProcessingActivityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [retentionPeriod, setRetentionPeriod] = useState("");
  const [riskFlag, setRiskFlag] = useState<"ok" | "to_review">("ok");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/rgpd/processing-activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, legalBasis, retentionPeriod, riskFlag }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'enregistrement.");
      return;
    }

    setName("");
    setLegalBasis("");
    setRetentionPeriod("");
    setRiskFlag("ok");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2.5 flex-wrap">
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Traitement</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-52" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Base légale</label>
        <input required value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-44" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Conservation</label>
        <input required value={retentionPeriod} onChange={(e) => setRetentionPeriod(e.target.value)} placeholder="5 ans" className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Statut</label>
        <select value={riskFlag} onChange={(e) => setRiskFlag(e.target.value as "ok" | "to_review")} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          <option value="ok">À jour</option>
          <option value="to_review">À revoir</option>
        </select>
      </div>
      <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <div className="text-[12px] text-rust w-full">{error}</div>}
    </form>
  );
}
