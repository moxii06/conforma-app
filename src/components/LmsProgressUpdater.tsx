"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LmsProgressUpdater({ dossierId, moduleId, percentComplete }: { dossierId: string; moduleId: string; percentComplete: number }) {
  const router = useRouter();
  const [value, setValue] = useState(percentComplete);
  const [saving, setSaving] = useState(false);

  async function commit(next: number) {
    setValue(next);
    setSaving(true);
    await fetch("/api/lms/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId, moduleId, percentComplete: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 w-40 shrink-0">
      <div className="h-1.5 bg-[#F1EFE8] rounded-full overflow-hidden flex-1">
        <div className="h-full bg-sage" style={{ width: `${value}%` }} />
      </div>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(Number(e.target.value))}
        onBlur={(e) => commit(Number(e.target.value))}
        className="w-12 border border-line rounded px-1 py-0.5 text-[11px] text-ink outline-none focus:border-seal"
      />
      <span className="text-[11px] text-slate">%</span>
    </div>
  );
}
