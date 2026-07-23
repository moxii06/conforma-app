"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string, string> = { open: "Ouverte", in_progress: "En cours", closed: "Clôturée" };

export function RightsRequestControls({
  requestId,
  status,
  assignedToUserId,
  members,
}: {
  requestId: string;
  status: string;
  assignedToUserId: string | null;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function update(data: { status?: string; assignedToUserId?: string | null }) {
    setSaving(true);
    await fetch(`/api/rgpd/rights-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={assignedToUserId ?? ""}
        onChange={(e) => update({ assignedToUserId: e.target.value || null })}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60 max-w-[110px]"
      >
        <option value="">Non assigné</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => update({ status: e.target.value })}
        disabled={saving}
        className="border border-line rounded px-1.5 py-1 text-[11.5px] text-ink outline-none focus:border-seal disabled:opacity-60"
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
