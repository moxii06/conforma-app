"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PlatformContactNoteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/plateforme/organizations/${organizationId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, occurredAt: new Date(date).toISOString() }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur.");
      return;
    }
    setNote("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] font-medium text-seal hover:underline self-start">
        + Noter un contact (appel, rendez-vous…)
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border border-line rounded-md p-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Ex. Appel avec Marie — a confirmé vouloir passer à l'offre Team."
        className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft resize-y"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-slate">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          />
        </label>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={loading || !note.trim()}
          className="text-[12.5px] font-medium text-seal hover:underline disabled:opacity-50"
        >
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
    </div>
  );
}
