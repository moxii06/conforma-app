"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DocumentActions({ documentId, archived, title }: { documentId: string; archived: boolean; title: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    setLoading(true);
    await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    setLoading(false);
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2 shrink-0">
      <button type="button" onClick={toggleArchive} disabled={loading} className="text-[11px] text-slate hover:text-ink disabled:opacity-60">
        {loading ? "…" : archived ? "Désarchiver" : "Archiver"}
      </button>
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={loading} className="text-[11px] text-rust hover:underline disabled:opacity-60">
        Supprimer
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={`Supprimer « ${title} » ?`}
        description="Le document sera définitivement supprimé. Cette action est irréversible."
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </span>
  );
}
