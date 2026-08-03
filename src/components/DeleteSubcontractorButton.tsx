"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeleteSubcontractorButton({ subcontractorId, name }: { subcontractorId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/subcontractors/${subcontractorId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la suppression.");
      setLoading(false);
      return;
    }
    router.push("/team?tab=prestataires");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-[11.5px] font-medium text-rust hover:underline decoration-rust"
      >
        Supprimer
      </button>
      <ConfirmDialog
        open={open}
        title={`Supprimer ${name} ?`}
        description="Cette action est définitive et retirera aussi ses documents suivis."
        loading={loading}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
