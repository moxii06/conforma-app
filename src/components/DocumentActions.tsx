"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentActions({ documentId, archived }: { documentId: string; archived: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleArchive() {
    setLoading(true);
    await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Supprimer définitivement ce document ? Cette action est irréversible.")) return;
    setLoading(true);
    await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2 shrink-0">
      <button type="button" onClick={toggleArchive} disabled={loading} className="text-[11px] text-slate hover:text-ink disabled:opacity-60">
        {loading ? "…" : archived ? "Désarchiver" : "Archiver"}
      </button>
      <button type="button" onClick={handleDelete} disabled={loading} className="text-[11px] text-rust hover:underline disabled:opacity-60">
        Supprimer
      </button>
    </span>
  );
}
