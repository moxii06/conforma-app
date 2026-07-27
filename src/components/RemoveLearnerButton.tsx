"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveLearnerButton({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/dossiers/${dossierId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la suppression.");
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={handleClick} disabled={loading} className="text-[11px] font-medium text-rust hover:underline disabled:opacity-60">
          {loading ? "…" : "Confirmer"}
        </button>
        <button onClick={() => setConfirming(false)} className="text-[11px] text-slate hover:underline">
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button onClick={handleClick} className="text-[11px] text-slate hover:text-rust hover:underline">
        Retirer de la formation
      </button>
      {error && <div className="text-[10.5px] text-rust max-w-[220px] text-right">{error}</div>}
    </div>
  );
}
