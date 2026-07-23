"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevokeAccessButton({ progressId }: { progressId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    await fetch(`/api/lms/progress/${progressId}`, { method: "DELETE" });
    setLoading(false);
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
    <button onClick={handleClick} className="text-[11px] text-slate hover:text-rust hover:underline">
      Retirer l&apos;accès
    </button>
  );
}
