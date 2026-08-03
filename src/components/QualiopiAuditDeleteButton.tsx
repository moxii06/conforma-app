"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function QualiopiAuditDeleteButton({ auditId, auditLabel }: { auditId: string; auditLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/qualiopi/audits/${auditId}`, { method: "DELETE" });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[10.5px] text-slate hover:text-rust">
        Supprimer
      </button>
      <ConfirmDialog
        open={open}
        title={`Supprimer l'${auditLabel} ?`}
        description="L'audit, ses constats et leurs actions correctives seront définitivement supprimés de l'historique Qualiopi."
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
