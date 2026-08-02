"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body.error ?? "Erreur lors de la suppression.");
      setConfirming(false);
      return;
    }
    router.push("/formations");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] text-rust">Supprimer définitivement ?</span>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="text-[11.5px] font-medium text-rust hover:underline disabled:opacity-60"
        >
          {loading ? "…" : "Confirmer"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-[11.5px] text-slate hover:underline">
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button type="button" onClick={handleClick} className="text-[11.5px] font-medium text-slate hover:text-rust">
        Supprimer
      </button>
      {error && <div className="text-[10.5px] text-rust max-w-[240px] text-right">{error}</div>}
    </div>
  );
}
