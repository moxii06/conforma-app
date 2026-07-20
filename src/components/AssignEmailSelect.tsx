"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: string; name: string };

export function AssignEmailSelect({
  messageId,
  members,
  assignedToUserId,
}: {
  messageId: string;
  members: Member[];
  assignedToUserId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleChange(userId: string) {
    setLoading(true);
    await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", userId: userId || null }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <select
      value={assignedToUserId ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={loading}
      className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal disabled:opacity-60"
    >
      <option value="">Non assigné</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
