"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubcontractorStatusSelect({ subcontractorId, status }: { subcontractorId: string; status: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    setSaving(true);
    await fetch(`/api/subcontractors/${subcontractorId}`, {
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
      <option value="active">Actif</option>
      <option value="expired">Expiré</option>
      <option value="terminated">Terminé</option>
    </select>
  );
}
