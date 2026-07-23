"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

export function PlanRetentionForm({ dossierId, retentionUntil }: { dossierId: string; retentionUntil: Date | null }) {
  const router = useRouter();
  const [value, setValue] = useState(retentionUntil ? format(retentionUntil, "yyyy-MM-dd") : "");
  const [saving, setSaving] = useState(false);

  async function save(next: string) {
    setSaving(true);
    await fetch(`/api/dossiers/${dossierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionUntil: next || null }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => save(value)}
        disabled={saving || !value}
        className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {saving ? "…" : "Planifier"}
      </button>
      {retentionUntil && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            save("");
          }}
          disabled={saving}
          className="text-[11.5px] text-slate hover:text-rust disabled:opacity-60"
        >
          Annuler la purge
        </button>
      )}
    </div>
  );
}
