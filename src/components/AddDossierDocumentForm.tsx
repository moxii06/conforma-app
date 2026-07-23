"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";

export function AddDossierDocumentForm({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/dossiers/${dossierId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, category }),
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
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 flex-wrap">
      <input required placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-32" />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal">
        {DOCUMENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
        ))}
      </select>
      <input required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal flex-1 min-w-[140px]" />
      <button type="submit" disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60 shrink-0">
        {loading ? "…" : "Ajouter"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </form>
  );
}
