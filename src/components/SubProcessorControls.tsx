"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function SubProcessorControls({
  subProcessorId,
  name,
  dpaStatus,
}: {
  subProcessorId: string;
  name: string;
  dpaStatus: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function updateStatus(value: string) {
    setSaving(true);
    await fetch(`/api/rgpd/sub-processors/${subProcessorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dpaStatus: value }),
    });
    setSaving(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/rgpd/sub-processors/${subProcessorId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error ?? "Erreur lors de la suppression.");
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={dpaStatus}
        onChange={(e) => updateStatus(e.target.value)}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60"
      >
        <option value="pending">En attente</option>
        <option value="signed">Signé</option>
      </select>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="text-[11px] font-medium text-rust underline decoration-line hover:decoration-rust"
      >
        Supprimer
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={`Supprimer « ${name} » ?`}
        description="Cette action est définitive et retirera ce sous-traitant du registre."
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
