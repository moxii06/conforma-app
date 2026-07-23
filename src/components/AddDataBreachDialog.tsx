"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// GDPR art. 33/34 register — the RGPD module tracked planned risk
// (registre, DPIA) but had nowhere to log an actual incident. Modal, same
// shell as SendDocumentDialog/CreateCourseForm, since this form has more
// fields than the single-line ones elsewhere on this page.
export function AddDataBreachDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discoveredAt, setDiscoveredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [affectedDataTypes, setAffectedDataTypes] = useState("");
  const [affectedPeopleCount, setAffectedPeopleCount] = useState("");
  const [severity, setSeverity] = useState<"low" | "moderate" | "high">("moderate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setDiscoveredAt(new Date().toISOString().slice(0, 16));
    setAffectedDataTypes("");
    setAffectedPeopleCount("");
    setSeverity("moderate");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/rgpd/data-breaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        discoveredAt: new Date(discoveredAt).toISOString(),
        affectedDataTypes,
        affectedPeopleCount: affectedPeopleCount ? parseInt(affectedPeopleCount, 10) : null,
        severity,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-rust text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:opacity-90">
        + Signaler un incident
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Signaler un incident / violation de données</div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-slate hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex. Envoi d'un email au mauvais destinataire)"
            required
            autoFocus
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description des faits"
            rows={3}
            required
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
          />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate uppercase tracking-wide">Découvert le</span>
            <input
              type="datetime-local"
              value={discoveredAt}
              onChange={(e) => setDiscoveredAt(e.target.value)}
              required
              className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </label>
          <input
            value={affectedDataTypes}
            onChange={(e) => setAffectedDataTypes(e.target.value)}
            placeholder="Données concernées (ex. noms, emails, coordonnées bancaires)"
            required
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          />
          <div className="flex items-center gap-2.5">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">Personnes concernées (est.)</span>
              <input
                type="number"
                min={0}
                value={affectedPeopleCount}
                onChange={(e) => setAffectedPeopleCount(e.target.value)}
                placeholder="Optionnel"
                className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[11px] text-slate uppercase tracking-wide">Gravité</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
              >
                <option value="low">Faible</option>
                <option value="moderate">Modérée</option>
                <option value="high">Élevée</option>
              </select>
            </label>
          </div>
          <div className="text-[11px] text-slate">
            La CNIL doit en principe être notifiée dans les 72h suivant la découverte (art. 33 RGPD), sauf si le risque pour les personnes est écarté.
          </div>
          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={loading || !title.trim() || !description.trim() || !affectedDataTypes.trim()} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
              {loading ? "…" : "Enregistrer"}
            </button>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </form>
      </div>
    </div>
  );
}
