"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonPicker, type LearnerInput } from "@/components/PersonPicker";
import { X } from "lucide-react";

type Member = { id: string; name: string };
type PendingLearner = { key: string; label: string; input: LearnerInput & { accessDurationDays?: number } };

export function CreateCourseForm({ members }: { members: Member[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<Set<string>>(new Set());
  const [learners, setLearners] = useState<PendingLearner[]>([]);
  const [accessDurationDays, setAccessDurationDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLearner(input: LearnerInput, label: string) {
    const key = "contactId" in input ? input.contactId : input.email;
    if (learners.some((l) => l.key === key)) return;
    const durationInput = accessDurationDays ? { accessDurationDays: parseInt(accessDurationDays, 10) } : {};
    setLearners((prev) => [...prev, { key, label, input: { ...input, ...durationInput } }]);
  }

  function removeLearner(key: string) {
    setLearners((prev) => prev.filter((l) => l.key !== key));
  }

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
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || undefined,
        responsibleUserIds: Array.from(responsibleIds),
        initialLearners: learners.map((l) => l.input),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }
    setTitle("");
    setDescription("");
    setResponsibleIds(new Set());
    setLearners([]);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:bg-ink-soft">
        + Créer une formation
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de la formation"
        required
        autoFocus
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optionnel)"
        rows={2}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
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
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] text-slate uppercase tracking-wide">Apprenants à inscrire (optionnel)</div>
        {learners.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {learners.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1 bg-white border border-line rounded-full pl-2.5 pr-1.5 py-1 text-[11.5px] text-ink">
                {l.label}
                {l.input.accessDurationDays && <span className="text-slate">· {l.input.accessDurationDays}j</span>}
                <button type="button" onClick={() => removeLearner(l.key)} className="text-slate hover:text-rust">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-[11.5px] text-slate">
          Durée pour terminer (jours, si formation en continu)
          <input
            type="number"
            min={1}
            value={accessDurationDays}
            onChange={(e) => setAccessDurationDays(e.target.value)}
            placeholder="ex. 90"
            className="w-20 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
          />
        </label>
        <PersonPicker onSelect={addLearner} />
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading || !title.trim()} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Créer la formation"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
