"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function OrganizationCgvControl({
  organizationId,
  cgvAcceptedAt,
}: {
  organizationId: string;
  cgvAcceptedAt: Date | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(() => toDateInputValue(cgvAcceptedAt ?? new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "set-cgv" | "clear-cgv") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/plateforme/organizations/${organizationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "set-cgv" ? { action, date } : { action }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
        />
        <button
          type="button"
          onClick={() => run("set-cgv")}
          disabled={loading}
          className="text-[12px] font-medium text-seal hover:underline disabled:opacity-60"
        >
          {loading ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
        {error && <span className="text-[11px] text-rust">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {cgvAcceptedAt ? (
        <>
          <span className="text-[12.5px] text-ink">CGV acceptées le {format(cgvAcceptedAt, "d MMMM yyyy", { locale: fr })}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-[11.5px] text-slate hover:text-ink">
            Modifier
          </button>
          <button type="button" onClick={() => run("clear-cgv")} disabled={loading} className="text-[11.5px] text-rust hover:underline disabled:opacity-60">
            Retirer
          </button>
        </>
      ) : (
        <>
          <span className="text-[12.5px] text-slate">CGV non renseignées</span>
          <button type="button" onClick={() => setEditing(true)} className="text-[11.5px] text-seal hover:underline">
            Renseigner la date
          </button>
        </>
      )}
    </div>
  );
}
