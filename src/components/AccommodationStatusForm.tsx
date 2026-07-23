"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccommodationStatusForm({
  dossierId,
  requestId,
  status,
  grantedAccommodations,
}: {
  dossierId: string;
  requestId: string;
  status: string;
  grantedAccommodations: string | null;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [granted, setGranted] = useState(grantedAccommodations ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/dossiers/${dossierId}/accommodations/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, grantedAccommodations: granted || undefined }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink">
          <option value="pending">En attente</option>
          <option value="granted">Accordé</option>
          <option value="declined">Refusé</option>
        </select>
        <button onClick={handleSave} disabled={saving} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {saving ? "…" : "Enregistrer"}
        </button>
      </div>
      <input
        value={granted}
        onChange={(e) => setGranted(e.target.value)}
        placeholder="Aménagements accordés"
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
      />
    </div>
  );
}
