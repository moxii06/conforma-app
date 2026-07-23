"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ComplaintStatusForm({ complaintId, status, resolutionNotes }: { complaintId: string; status: string; resolutionNotes: string | null }) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [notes, setNotes] = useState(resolutionNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/complaints/${complaintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, resolutionNotes: notes || undefined }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
          <option value="open">Ouverte</option>
          <option value="investigating">En cours d&apos;examen</option>
          <option value="resolved">Résolue</option>
        </select>
        <button onClick={handleSave} disabled={saving} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {saving ? "…" : "Enregistrer"}
        </button>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes de résolution"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
    </div>
  );
}
