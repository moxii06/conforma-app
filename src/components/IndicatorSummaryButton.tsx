"use client";

import { useState } from "react";

export function IndicatorSummaryButton({ indicatorNumber, initialSummary }: { indicatorNumber: number; initialSummary: string | null }) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(force = false) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/qualiopi/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indicatorNumber, force }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur inattendue.");
      return;
    }
    setSummary(body.summary);
    setOpen(true);
  }

  if (summary && open) {
    return (
      <div className="pl-6 pb-2 flex flex-col gap-1.5">
        <div className="text-[12px] text-slate whitespace-pre-wrap">{summary}</div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => handleGenerate(true)} disabled={loading} className="text-[11px] text-slate hover:text-ink disabled:opacity-60">
            {loading ? "…" : "Régénérer"}
          </button>
          <button onClick={() => setOpen(false)} className="text-[11px] text-slate hover:text-ink">
            Réduire
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-6 pb-1.5 flex items-center gap-2.5">
      <button
        onClick={() => (summary ? setOpen(true) : handleGenerate())}
        disabled={loading}
        className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {loading ? "…" : "Voir mon résumé personnalisé"}
      </button>
      {error && <div className="text-[11px] text-rust">{error}</div>}
    </div>
  );
}
