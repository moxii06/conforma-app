"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewChapterForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la création.");
      return;
    }
    setTitle("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
        + Ajouter un chapitre
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        autoFocus
        required
        placeholder="Titre du chapitre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
      />
      <button type="submit" disabled={loading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
        {loading ? "…" : "Ajouter"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
        Annuler
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </form>
  );
}
