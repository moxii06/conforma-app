"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function QualiopiAuditDeleteButton({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/qualiopi/audits/${auditId}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <button onClick={handleDelete} disabled={loading} className="text-[10.5px] font-medium text-rust hover:underline disabled:opacity-60">
          {loading ? "…" : "Confirmer la suppression"}
        </button>
        <button onClick={() => setConfirming(false)} className="text-[10.5px] text-slate hover:underline">
          Annuler
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-[10.5px] text-slate hover:text-rust">
      Supprimer
    </button>
  );
}
