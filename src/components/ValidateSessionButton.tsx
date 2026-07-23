"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client feedback: validating a session (DRAFT -> VALIDATED) was one-way —
// once validated there was no way back short of editing the database. The
// PATCH route already accepts either SessionStatus, so this just adds the
// reverse action alongside the forward one.
export function ValidateSessionButton({ sessionId, isValidated }: { sessionId: string; isValidated: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: "VALIDATED" | "DRAFT") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors du changement de statut.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {isValidated ? (
        <button
          onClick={() => setStatus("DRAFT")}
          disabled={loading}
          className="text-[12.5px] font-medium text-slate hover:text-ink disabled:opacity-60 self-start"
        >
          {loading ? "…" : "Repasser en brouillon"}
        </button>
      ) : (
        <button
          onClick={() => setStatus("VALIDATED")}
          disabled={loading}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
        >
          {loading ? "…" : "Valider la session"}
        </button>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
