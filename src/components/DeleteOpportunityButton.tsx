"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    await fetch(`/api/crm/opportunities/${opportunityId}`, { method: "DELETE" });
    setDeleting(false);
    router.refresh();
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[11px] font-medium text-rust hover:underline disabled:opacity-60"
        >
          {deleting ? "…" : "Confirmer la suppression"}
        </button>
        <button onClick={handleCancel} className="text-[11px] text-slate hover:underline">
          Annuler
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleDelete} className="text-[11px] text-slate hover:text-rust hover:underline self-start">
      Supprimer
    </button>
  );
}
