"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEARNER_CATEGORY_LABELS } from "@/lib/bpfCategories";

export function DossierCategorySelect({ dossierId, learnerCategory }: { dossierId: string; learnerCategory: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(learnerCategory ?? "");
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    setSaving(true);
    await fetch(`/api/dossiers/${dossierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnerCategory: next }),
    });
    setSaving(false);
    router.refresh();
  }

  const options = Object.entries(LEARNER_CATEGORY_LABELS).filter(([key]) => key !== "unset");

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal disabled:opacity-60"
    >
      <option value="" disabled>
        Catégorie (BPF)
      </option>
      {options.map(([key, label]) => (
        <option key={key} value={key}>{label}</option>
      ))}
    </select>
  );
}
