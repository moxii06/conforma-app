"use client";

import { useState } from "react";

export function GenerateCertificateButton({ sessionId, dossierId }: { sessionId: string; dossierId: string }) {
  const [loading, setLoading] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}/attendance/certificate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de la génération.");
      return;
    }
    setDocId(body.id);
  }

  if (docId) {
    return (
      <a href={`/api/documents/generated/${docId}`} target="_blank" rel="noreferrer" className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Voir l&apos;attestation
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={handleClick} disabled={loading} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
        {loading ? "…" : "Générer l'attestation de présence"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
