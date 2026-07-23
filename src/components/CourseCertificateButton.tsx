"use client";

import { useState } from "react";
import { Award } from "lucide-react";

export function CourseCertificateButton({ dossierId }: { dossierId: string }) {
  const [loading, setLoading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/lms/dossiers/${dossierId}/certificate`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de la génération.");
      return;
    }
    setDocumentId(body.id);
  }

  if (documentId) {
    return (
      <a
        href={`/api/documents/generated/${documentId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 bg-sage text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:opacity-90"
      >
        <Award size={14} /> Voir mon attestation
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 bg-sage text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:opacity-90 disabled:opacity-60"
      >
        <Award size={14} /> {loading ? "…" : "Obtenir mon attestation de réussite"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
