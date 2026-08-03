"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeleteOpportunityButton({ opportunityId, contactName }: { opportunityId: string; contactName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/crm/opportunities/${opportunityId}`, { method: "DELETE" });
    setDeleting(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-[11px] text-slate hover:text-rust hover:underline self-start"
      >
        Supprimer
      </button>
      {/* stopPropagation on the wrapper: the dialog lives inside a clickable
          table row — without it, closing the dialog would also open the
          prospect's page. */}
      {open && (
        <span onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            open={open}
            title={`Supprimer l'opportunité de ${contactName} ?`}
            description="L'opportunité et son historique commercial seront définitivement supprimés — la fiche contact, elle, est conservée."
            loading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setOpen(false)}
          />
        </span>
      )}
    </>
  );
}
