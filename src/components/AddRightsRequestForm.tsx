"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function oneMonthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function AddRightsRequestForm() {
  const router = useRouter();
  const [requestType, setRequestType] = useState<"access" | "erasure" | "portability" | "rectification">("access");
  const [personLabel, setPersonLabel] = useState("");
  const [deadline, setDeadline] = useState(oneMonthFromNow());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/rgpd/rights-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType, personLabel, deadline }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'enregistrement.");
      return;
    }

    setPersonLabel("");
    setDeadline(oneMonthFromNow());
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2.5 flex-wrap">
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Type de demande</label>
        <select value={requestType} onChange={(e) => setRequestType(e.target.value as typeof requestType)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          <option value="access">Accès</option>
          <option value="erasure">Effacement</option>
          <option value="portability">Portabilité</option>
          <option value="rectification">Rectification</option>
        </select>
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Personne concernée</label>
        <input required value={personLabel} onChange={(e) => setPersonLabel(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-48" />
      </div>
      <div>
        <label className="text-[11.5px] text-slate mb-1 block">Échéance</label>
        <input type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
      </div>
      <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <div className="text-[12px] text-rust w-full">{error}</div>}
    </form>
  );
}
