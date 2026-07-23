"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: string; name: string };

export function ReferentHandicapSelect({ members, currentUserId }: { members: Member[]; currentUserId: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(userId: string) {
    setSaving(true);
    await fetch("/api/team/referent-handicap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId || null }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={currentUserId ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink disabled:opacity-60"
    >
      <option value="">Non désigné</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
