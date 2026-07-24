"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client feedback: no way to call off a session (trainer pulls out, too few
// sign-ups) without either leaving it in a misleading VALIDATED/DRAFT state
// or deleting it outright. Reuses the same PATCH route as
// ValidateSessionButton — CANCELLED is just another SessionStatus.
export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!confirm("Annuler cette session ? Les apprenants déjà invités ne seront pas notifiés automatiquement.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'annulation.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="text-[12.5px] font-medium text-rust hover:underline disabled:opacity-60 self-start"
      >
        {loading ? "…" : "Annuler la session"}
      </button>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
