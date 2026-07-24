"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveOrgChartButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/team/org-chart/archive", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'archivage.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleArchive}
        disabled={loading}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
      >
        {loading ? "…" : "Archiver cette version"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
