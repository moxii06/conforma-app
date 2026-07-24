"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";

type Course = { id: string; title: string };

export function NewTemplateForm({ courses = [] }: { courses?: Course[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/documents/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, title, bodyText, courseId: courseId || undefined }),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }

    setTitle("");
    setBodyText("");
    setCourseId("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft self-start"
      >
        + Ajouter votre propre modèle
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3">
      <div className="flex gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <input required placeholder="Titre du modèle" value={title} onChange={(e) => setTitle(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1" />
      </div>
      {courses.length > 0 && (
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
        >
          <option value="">Document général (toutes formations)</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>Bibliothèque : {c.title}</option>
          ))}
        </select>
      )}
      <textarea
        required
        placeholder="Contenu du modèle…"
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        rows={8}
        className="border border-line rounded-md px-3 py-2 text-[12.5px] text-ink outline-none focus:border-seal font-mono leading-relaxed"
      />
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Créer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
