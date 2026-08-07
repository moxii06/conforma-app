"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function ProcessingActivityControls({
  activityId,
  name,
  riskFlag,
}: {
  activityId: string;
  name: string;
  riskFlag: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function updateStatus(value: string) {
    setSaving(true);
    await fetch(`/api/rgpd/processing-activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskFlag: value }),
    });
    setSaving(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/rgpd/processing-activities/${activityId}`, { method: "DELETE" });
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
        value={riskFlag}
        onChange={(e) => updateStatus(e.target.value)}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60"
      >
        <option value="ok">À jour</option>
        <option value="to_review">À revoir</option>
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
        title={`Supprimer « ${name} » du registre ?`}
        description="Cette action est définitive. Si une analyse d'impact (DPIA) est liée à ce traitement, la suppression sera refusée."
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
