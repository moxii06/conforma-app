"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateRightsRequestButton({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCreate(requestType: string) {
    setLoading(requestType);
    await fetch(`/api/dossiers/${dossierId}/rights-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType }),
    });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={() => handleCreate("access")} disabled={loading !== null} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
        {loading === "access" ? "…" : "Créer une demande d'accès"}
      </button>
      <button onClick={() => handleCreate("erasure")} disabled={loading !== null} className="text-[12px] font-medium text-rust underline decoration-line hover:decoration-rust disabled:opacity-60">
        {loading === "erasure" ? "…" : "Créer une demande d'effacement"}
      </button>
    </div>
  );
}
