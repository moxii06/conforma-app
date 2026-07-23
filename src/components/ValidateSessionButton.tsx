"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ValidateSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "VALIDATED" }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la validation.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleValidate}
        disabled={loading}
        className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
      >
        {loading ? "…" : "Valider la session"}
      </button>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
