"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; title: string };

const TYPE_LABELS: Record<string, string> = {
  legal: "Veille légale et réglementaire",
  metiers_competences: "Évolutions métiers et compétences",
  pedagogique_technologique: "Innovations pédagogiques et technologiques",
  reseaux_partenariats: "Réseaux professionnels et partenariats",
};

export function RegulatoryWatchForm({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [watchType, setWatchType] = useState("legal");
  const [source, setSource] = useState("");
  const [watchDate, setWatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCourse(id: string) {
    setCourseIds((prev) => {
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
    const res = await fetch("/api/qualiopi/regulatory-watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        watchType,
        source,
        watchDate,
        summary,
        ownerName,
        affectedCourseIds: Array.from(courseIds),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setSource("");
    setSummary("");
    setOwnerName("");
    setCourseIds(new Set());
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        + Nouvel élément de veille
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 bg-[#FAF8F2] border border-line rounded-md p-3.5">
      <select value={watchType} onChange={(e) => setWatchType(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source (publication, site, réseau...)"
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Résumé de ce qui a été identifié"
        rows={2}
        required
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
      />
      <div className="flex items-center gap-2">
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Date
          <input type="date" value={watchDate} onChange={(e) => setWatchDate(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink" />
        </label>
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Responsable du suivi"
          required
          className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink flex-1"
        />
      </div>
      {courses.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-slate uppercase tracking-wide">Formations concernées</div>
          <div className="flex flex-wrap gap-2">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-[12px] text-ink">
                <input type="checkbox" checked={courseIds.has(c.id)} onChange={() => toggleCourse(c.id)} className="accent-sage" />
                {c.title}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">Annuler</button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
