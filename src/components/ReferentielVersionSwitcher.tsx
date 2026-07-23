"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Version = { id: string; label: string; status: string };

const STATUS_LABELS: Record<string, string> = {
  projet: "Projet",
  publie: "Publié",
  applicable: "Applicable",
  archive: "Archivé",
};

export function ReferentielVersionSwitcher({ versions, activeVersionId }: { versions: Version[]; activeVersionId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(activeVersionId);
  const [saving, setSaving] = useState(false);

  async function handleChange(versionId: string) {
    setSelected(versionId);
    setSaving(true);
    await fetch("/api/qualiopi/referentiel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2.5">
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft disabled:opacity-60"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label} — {STATUS_LABELS[v.status] ?? v.status}
          </option>
        ))}
      </select>
      {saving && <span className="text-[11px] text-slate">Enregistrement…</span>}
    </div>
  );
}
