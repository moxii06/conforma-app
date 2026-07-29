"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";

type Course = { id: string; title: string };

// From the course detail page's own "Documents de la formation" tab, the
// course is already known and fixed — showing the general-library picker
// there would let staff accidentally create a "Document général" (or a
// document for a different course) from inside a specific course's own
// document section, which is never the intent from that entry point.
export function NewTemplateForm({ courses = [], fixedCourse }: { courses?: Course[]; fixedCourse?: Course }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [courseId, setCourseId] = useState(fixedCourse?.id ?? "");
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [conditional, setConditional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // A conditional template's real content lives in its blocks, added
    // after creation (see TemplateBlocksEditor) — bodyText just needs a
    // non-empty placeholder to satisfy the API, and is ignored from then on.
    const res = await fetch("/api/documents/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        title,
        bodyText: conditional ? "[Modèle avec paragraphes conditionnels — voir les blocs ci-dessous.]" : bodyText,
        courseId: courseId || undefined,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }

    setTitle("");
    setBodyText("");
    setConditional(false);
    setCourseId(fixedCourse?.id ?? "");
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
      {fixedCourse ? (
        <div className="text-[11.5px] text-slate">
          Bibliothèque : <span className="text-ink font-medium">{fixedCourse.title}</span>
        </div>
      ) : (
        courses.length > 0 && (
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
        )
      )}
      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input type="checkbox" checked={conditional} onChange={(e) => setConditional(e.target.checked)} className="accent-sage" />
        Modèle avec paragraphes conditionnels
        <span className="text-slate">(le texte varie selon les réponses du dossier — statut, modalité…)</span>
      </label>
      {conditional && (
        <div className="text-[11px] text-slate">
          Vous ajouterez les paragraphes juste après la création du modèle.
        </div>
      )}
      <textarea
        required={!conditional}
        disabled={conditional}
        placeholder={conditional ? "Contenu géré par les paragraphes, après création." : "Contenu du modèle…"}
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        rows={8}
        className="border border-line rounded-md px-3 py-2 text-[12.5px] text-ink outline-none focus:border-seal font-mono leading-relaxed disabled:bg-linen disabled:text-slate"
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
