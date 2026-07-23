"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string, string> = {
  identifie: "Identifié",
  en_cours: "En cours",
  maitrise: "Maîtrisé",
  clos: "Clos",
};

export function QualityRiskStatusSelect({ riskId, status }: { riskId: string; status: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    setSaving(true);
    await fetch(`/api/qualiopi/risks/${riskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className="bg-white border border-line rounded-md px-2 py-1 text-[11.5px] text-ink disabled:opacity-60"
    >
      {Object.entries(STATUS_LABELS).map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
