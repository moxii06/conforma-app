"use client";

import { useState } from "react";

type Dossier = { id: string; label: string };

export function GenerateDocumentButton({ templateId, dossiers }: { templateId: string; dossiers: Dossier[] }) {
  const [open, setOpen] = useState(false);
  const [dossierId, setDossierId] = useState(dossiers[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.MouseEvent) {
    e.preventDefault();
    if (!dossierId) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, dossierId }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la génération.");
      return;
    }
    const doc = await res.json();
    setResult({ id: doc.id, title: doc.title });
  }

  if (dossiers.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        Générer pour un dossier
      </button>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <select value={dossierId} onChange={(e) => setDossierId(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal">
          {dossiers.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        <button onClick={handleGenerate} disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {loading ? "…" : "Générer"}
        </button>
      </div>
      {result && (
        <div className="text-[11.5px] text-sage">
          Document créé : <a href={`/api/documents/generated/${result.id}`} target="_blank" rel="noreferrer" className="underline">{result.title}</a>
        </div>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
