"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeleteModuleButton({ moduleId, moduleTitle }: { moduleId: string; moduleTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/lms/modules/${moduleId}`, { method: "DELETE" });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[11px] text-slate hover:text-rust hover:underline">
        Supprimer le module
      </button>
      <ConfirmDialog
        open={open}
        title={`Supprimer le module « ${moduleTitle} » ?`}
        description="Le contenu du module et la progression des apprenants dessus seront définitivement supprimés."
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
