"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChecklistToggle({ indicatorNumber, gathered }: { indicatorNumber: number; gathered: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(gathered);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setSaving(true);
    await fetch("/api/qualiopi/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indicatorNumber, gathered: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={saving}
      onChange={toggle}
      className="w-4 h-4 accent-sage cursor-pointer"
    />
  );
}
