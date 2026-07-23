"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveCourseButton({ courseId, archived }: { courseId: string; archived: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!archived && !confirm("Archiver cette formation ? Elle disparaîtra du catalogue actif mais rien n'est supprimé.")) return;
    setLoading(true);
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="text-[11.5px] font-medium text-slate hover:text-ink disabled:opacity-60"
    >
      {loading ? "…" : archived ? "Désarchiver" : "Archiver"}
    </button>
  );
}
