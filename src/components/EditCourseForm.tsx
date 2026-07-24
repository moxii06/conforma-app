"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: string; name: string };

export function EditCourseForm({
  courseId,
  members,
  initial,
}: {
  courseId: string;
  members: Member[];
  initial: {
    title: string;
    description: string | null;
    responsibleUserIds: string[];
    durationHours: number | null;
    priceCents: number | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [responsibleIds, setResponsibleIds] = useState<Set<string>>(new Set(initial.responsibleUserIds));
  const [durationHours, setDurationHours] = useState(initial.durationHours != null ? String(initial.durationHours) : "");
  const [price, setPrice] = useState(initial.priceCents != null ? String(initial.priceCents / 100) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleResponsible(id: string) {
    setResponsibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        responsibleUserIds: Array.from(responsibleIds),
        durationHours: durationHours ? parseInt(durationHours, 10) : null,
        priceCents: price ? Math.round(parseFloat(price) * 100) : null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la modification.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Modifier
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#EFEDE7] border border-line rounded-md p-3.5 flex flex-col gap-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de la formation"
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optionnel)"
        rows={2}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <div className="flex gap-2">
        <input
          value={durationHours}
          onChange={(e) => setDurationHours(e.target.value)}
          type="number"
          min={1}
          placeholder="Durée (heures)"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft flex-1"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          min={0}
          step="0.01"
          placeholder="Prix (€)"
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft flex-1"
        />
      </div>
      {members.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-slate uppercase tracking-wide">Responsables / personnes concernées</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input type="checkbox" checked={responsibleIds.has(m.id)} onChange={() => toggleResponsible(m.id)} className="accent-sage" />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading || !title.trim()} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
