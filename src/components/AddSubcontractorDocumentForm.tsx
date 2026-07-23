"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddSubcontractorDocumentForm({ subcontractorId }: { subcontractorId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/subcontractors/${subcontractorId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'ajout.");
      return;
    }
    setTitle("");
    setUrl("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input required placeholder="Titre (contrat, diplôme...)" value={title} onChange={(e) => setTitle(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-40" />
      <input required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal flex-1" />
      <button type="submit" disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60 shrink-0">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </form>
  );
}
