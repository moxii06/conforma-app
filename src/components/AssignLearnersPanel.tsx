"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EligibleDossier = { id: string; contactName: string };

export function AssignLearnersPanel({ moduleId, eligibleDossiers }: { moduleId: string; eligibleDossiers: EligibleDossier[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side filter — the full eligible list is already fetched (it's
  // one course's roster, not the whole org), so a debounce/URL round-trip
  // like SearchInput would be overkill here. Still worth having: a popular
  // course run across many sessions in a year for an OFP with 300+
  // learners can easily have a roster too long to scan by eye.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return eligibleDossiers;
    return eligibleDossiers.filter((d) => d.contactName.toLowerCase().includes(q));
  }, [eligibleDossiers, filter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selected.has(d.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const d of filtered) next.delete(d.id);
      } else {
        for (const d of filtered) next.add(d.id);
      }
      return next;
    });
  }

  async function handleAssign() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/lms/modules/${moduleId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierIds: Array.from(selected) }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'assignation.");
      return;
    }
    setSelected(new Set());
    setOpen(false);
    router.refresh();
  }

  if (eligibleDossiers.length === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Assigner des apprenants
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 bg-[#FAF8F2] border border-line rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Apprenants sans accès</div>
        {eligibleDossiers.length > 6 && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer par nom…"
            className="bg-white border border-line rounded-md px-2 py-1 text-[11.5px] text-ink w-36 focus:outline-none focus:border-ink-soft"
          />
        )}
      </div>
      {filtered.length > 1 && (
        <label className="flex items-center gap-2 text-[11.5px] text-slate">
          <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} className="w-3.5 h-3.5 accent-sage" />
          Tout sélectionner {filter ? `(${filtered.length} affiché${filtered.length > 1 ? "s" : ""})` : ""}
        </label>
      )}
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {filtered.map((d) => (
          <label key={d.id} className="flex items-center gap-2 text-[12.5px] text-ink">
            <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="w-3.5 h-3.5 accent-sage" />
            {d.contactName}
          </label>
        ))}
        {filtered.length === 0 && <div className="text-[11.5px] text-slate">Aucun apprenant ne correspond.</div>}
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={handleAssign}
          disabled={loading || selected.size === 0}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {loading ? "…" : `Assigner (${selected.size})`}
        </button>
        <button onClick={() => setOpen(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
