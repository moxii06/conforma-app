"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RISK_LEVEL_LABELS: Record<string, string> = { low: "Faible", moderate: "Modéré", high: "Élevé" };
const DPIA_STATUS_LABELS: Record<string, string> = {
  required: "Requise",
  in_progress: "En cours",
  validated: "Validée",
  not_required: "Non requise",
};

export function DpiaControls({
  dpiaId,
  status,
  riskLevel,
}: {
  dpiaId: string;
  status: string;
  riskLevel: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function update(data: { status?: string; riskLevel?: string }) {
    setSaving(true);
    await fetch(`/api/rgpd/dpia/${dpiaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={riskLevel}
        onChange={(e) => update({ riskLevel: e.target.value })}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60"
      >
        {Object.entries(RISK_LEVEL_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => update({ status: e.target.value })}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60"
      >
        {Object.entries(DPIA_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
