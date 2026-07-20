"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuditDateForm({ initialDate }: { initialDate: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialDate ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    await fetch("/api/organization/audit-date", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nextAuditDate: value }),
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
        className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-[12.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {saving ? "…" : "Modifier"}
      </button>
    </div>
  );
}
