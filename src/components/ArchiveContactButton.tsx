"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveContactButton({ contactId, archived }: { contactId: string; archived: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    await fetch(`/api/crm/contacts/${contactId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-[11px] text-slate hover:text-ink hover:underline self-start disabled:opacity-60"
    >
      {loading ? "…" : archived ? "Désarchiver" : "Archiver"}
    </button>
  );
}
