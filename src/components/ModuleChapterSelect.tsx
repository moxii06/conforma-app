"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ModuleChapterSelect({
  moduleId,
  chapterId,
  chapters,
}: {
  moduleId: string;
  chapterId: string | null;
  chapters: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    await fetch(`/api/lms/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: e.target.value || null }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={chapterId ?? ""}
      onChange={handleChange}
      disabled={saving}
      title="Chapitre"
      className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink outline-none focus:border-seal disabled:opacity-60 bg-white"
    >
      <option value="">Sans chapitre</option>
      {chapters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );
}
