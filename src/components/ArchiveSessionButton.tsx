"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveSessionButton({ sessionId, archived }: { sessionId: string; archived: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    await fetch(`/api/planning/sessions/${sessionId}/archive`, {
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
      onClick={handleClick}
      disabled={loading}
      className="text-[12.5px] font-medium text-slate hover:text-ink disabled:opacity-60 self-start"
    >
      {loading ? "…" : archived ? "Désarchiver" : "Archiver"}
    </button>
  );
}
