"use client";

import { useEffect, useState } from "react";

type DryRun = { blobs: number; rows: number; sample: string[] };
type Batch = {
  migrated: number;
  rowsRepointed: number;
  remaining: number;
  details: { pathname: string; rows: number }[];
  failed: { fileUrl: string; error: string }[];
};

// Companion UI for the temporary /api/admin/migrate-blobs route. A one-shot
// data migration run by hand deserves a visible control rather than a script
// nobody can review: it shows what would move before anything moves, and the
// same person who clicks it sees the result. Goes away with the route.
export function MigrateBlobsPanel() {
  const [plan, setPlan] = useState<DryRun | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadPlan() {
    setError(null);
    const res = await fetch("/api/admin/migrate-blobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`);
      return;
    }
    setPlan(await res.json());
  }

  useEffect(() => {
    void loadPlan();
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    setLog([]);
    // Loop the batches here rather than server-side: each call is one
    // function invocation with its own time budget, and progress stays
    // visible instead of hanging on a single long request.
    for (let pass = 0; pass < 20; pass++) {
      const res = await fetch("/api/admin/migrate-blobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: 3 }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`);
        break;
      }
      const result: Batch = await res.json();
      setLog((prev) => [
        ...prev,
        ...result.details.map((d) => `✓ ${d.pathname} (${d.rows} ligne${d.rows > 1 ? "s" : ""} repointée${d.rows > 1 ? "s" : ""})`),
        ...result.failed.map((f) => `✗ ${f.fileUrl} — ${f.error}`),
      ]);
      if (result.remaining === 0 || result.migrated === 0) break;
    }
    setRunning(false);
    await loadPlan();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="bg-rust/10 border border-rust/30 text-rust rounded-card px-3.5 py-2.5 text-[12.5px]">{error}</div>
      )}

      <div className="bg-paper border border-line rounded-card p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-[12.5px] text-slate">Fichiers encore dans l&apos;ancien store public et référencés en base</div>
          <div className="font-mono text-[22px] text-ink tabular-nums">{plan ? plan.blobs : "…"}</div>
        </div>

        {plan && plan.blobs > 0 && (
          <ul className="flex flex-col gap-1 border-t border-line pt-3">
            {plan.sample.map((p) => (
              <li key={p} className="font-mono text-[11.5px] text-slate break-all">
                {p}
              </li>
            ))}
          </ul>
        )}

        {plan && plan.blobs === 0 && (
          <div className="border-t border-line pt-3 text-[12.5px] text-sage">
            Plus rien à migrer. Cette page et sa route peuvent être retirées.
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-3">
          <button
            onClick={run}
            disabled={running || !plan || plan.blobs === 0}
            className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:bg-ink-soft disabled:opacity-50"
          >
            {running ? "Migration en cours…" : "Migrer vers le store privé"}
          </button>
          <span className="text-[11.5px] text-slate">
            Copie chaque fichier, repointe les lignes, puis supprime l&apos;original.
          </span>
        </div>
      </div>

      {log.length > 0 && (
        <div className="bg-linen border border-line rounded-card p-4 flex flex-col gap-1">
          {log.map((line, i) => (
            <div key={i} className="font-mono text-[11.5px] text-ink break-all">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
