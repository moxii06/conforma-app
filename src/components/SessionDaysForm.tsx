"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui";

type Day = { date: string; morningHours: number | null; afternoonHours: number | null; locked: boolean };

/**
 * Defines which days a session actually runs, and how many teaching hours
 * each half-day carries.
 *
 * The hours are typed rather than derived from start/end times because only
 * the OF knows what a day really contained — 9h-17h with an hour for lunch is
 * 7 hours, not 8, and that number goes straight into a legal declaration.
 *
 * A day that already has signatures is locked: its attendance is audit
 * evidence, and letting it be deleted from a form would quietly destroy proof.
 */
export function SessionDaysForm({
  sessionId,
  initialDays,
  defaultDate,
  canEdit,
}: {
  sessionId: string;
  initialDays: Day[];
  defaultDate: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState<Day[]>(
    initialDays.length > 0
      ? initialDays
      : [{ date: defaultDate, morningHours: 3.5, afternoonHours: 3.5, locked: false }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  function addDay() {
    const last = days[days.length - 1];
    // Next calendar day as a starting guess — most multi-day sessions run
    // consecutively, and it's one tap to change when they don't.
    const next = last ? new Date(`${last.date}T00:00:00.000Z`) : new Date(`${defaultDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    setDays((prev) => [
      ...prev,
      { date: next.toISOString().slice(0, 10), morningHours: 3.5, afternoonHours: 3.5, locked: false },
    ]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/planning/sessions/${sessionId}/days`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: days.map((d) => ({
          date: d.date,
          morningHours: d.morningHours,
          afternoonHours: d.afternoonHours,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Enregistrement impossible.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function hoursInput(value: number | null, onChange: (v: number | null) => void, locked: boolean, label: string) {
    return (
      <label className="flex flex-col gap-1 flex-1 min-w-[92px]">
        <span className="text-[10.5px] text-slate uppercase tracking-wide">{label}</span>
        <input
          type="number"
          step="0.5"
          min="0"
          max="12"
          value={value ?? ""}
          placeholder="—"
          disabled={!canEdit || locked}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal disabled:bg-linen disabled:text-slate"
        />
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {days.map((d, i) => (
        <div key={`${d.date}-${i}`} className="flex items-end gap-2.5 flex-wrap border-t border-line pt-2.5 first:border-t-0 first:pt-0">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-slate uppercase tracking-wide">Date</span>
            <input
              type="date"
              value={d.date}
              disabled={!canEdit || d.locked}
              onChange={(e) => update(i, { date: e.target.value })}
              className="border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal disabled:bg-linen disabled:text-slate"
            />
          </label>
          {hoursInput(d.morningHours, (v) => update(i, { morningHours: v }), d.locked, "Matin (h)")}
          {hoursInput(d.afternoonHours, (v) => update(i, { afternoonHours: v }), d.locked, "Après-midi (h)")}
          {d.locked ? (
            <span
              title="Cette journée est déjà émargée — les signatures sont des preuves d'audit."
              className="inline-flex items-center gap-1 text-[11px] text-slate min-h-11 px-2"
            >
              <Lock size={12} /> émargée
            </span>
          ) : (
            canEdit && (
              <button
                type="button"
                onClick={() => {
                  setDays((prev) => prev.filter((_, j) => j !== i));
                  setSaved(false);
                }}
                aria-label="Retirer cette journée"
                className="text-slate hover:text-rust min-h-11 min-w-11 flex items-center justify-center"
              >
                <Trash2 size={15} />
              </button>
            )
          )}
        </div>
      ))}

      {canEdit && (
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button"
            onClick={addDay}
            className="inline-flex items-center gap-1.5 text-[12px] text-slate hover:text-ink underline decoration-line"
          >
            <Plus size={13} /> Ajouter une journée
          </button>
          <div className="flex-1" />
          {saved && <span className="text-[11.5px] text-sage">Enregistré</span>}
          {error && <span className="text-[11.5px] text-rust">{error}</span>}
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? "…" : "Enregistrer les journées"}
          </Button>
        </div>
      )}
    </div>
  );
}
