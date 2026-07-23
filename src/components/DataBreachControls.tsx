"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string, string> = { investigating: "En cours d'analyse", contained: "Maîtrisée", closed: "Clôturée" };

export function DataBreachControls({
  breachId,
  status,
  notifiedAuthorityAt,
  notifiedSubjectsAt,
}: {
  breachId: string;
  status: string;
  notifiedAuthorityAt: Date | null;
  notifiedSubjectsAt: Date | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function update(data: { status?: string; notifyAuthority?: boolean; notifySubjects?: boolean }) {
    setSaving(true);
    await fetch(`/api/rgpd/data-breaches/${breachId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={status}
        onChange={(e) => update({ status: e.target.value })}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60"
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {!notifiedAuthorityAt ? (
        <button type="button" onClick={() => update({ notifyAuthority: true })} disabled={saving} className="text-[11px] font-medium text-rust underline decoration-line hover:decoration-rust disabled:opacity-60">
          Marquer la CNIL notifiée
        </button>
      ) : (
        <span className="text-[11px] text-sage">CNIL notifiée</span>
      )}
      {!notifiedSubjectsAt ? (
        <button type="button" onClick={() => update({ notifySubjects: true })} disabled={saving} className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          Marquer personnes notifiées
        </button>
      ) : (
        <span className="text-[11px] text-sage">Personnes notifiées</span>
      )}
    </div>
  );
}
