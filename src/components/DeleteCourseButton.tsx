"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeleteCourseButton({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      // Shown inside the dialog — the API refuses if learners are enrolled,
      // and that explanation is what the user needs to read before retrying.
      setError(body.error ?? "Erreur lors de la suppression.");
      return;
    }
    router.push("/formations");
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
        className="text-[11.5px] font-medium text-slate hover:text-rust"
      >
        Supprimer
      </button>
      <ConfirmDialog
        open={open}
        title={`Supprimer « ${courseTitle} » ?`}
        description="La formation, ses modules et son contenu e-learning seront définitivement supprimés."
        loading={loading}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
