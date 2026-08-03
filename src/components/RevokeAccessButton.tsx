"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function RevokeAccessButton({ progressId, learnerName }: { progressId: string; learnerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRevoke() {
    setLoading(true);
    await fetch(`/api/lms/progress/${progressId}`, { method: "DELETE" });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[11px] text-slate hover:text-rust hover:underline">
        Retirer l&apos;accès
      </button>
      <ConfirmDialog
        open={open}
        title={`Retirer l'accès de ${learnerName} ?`}
        description="Sa progression sur ce module sera supprimée — un nouvel accès repartira de zéro."
        confirmLabel="Retirer l'accès"
        loading={loading}
        onConfirm={handleRevoke}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
