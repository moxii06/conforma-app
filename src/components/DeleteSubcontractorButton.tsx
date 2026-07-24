"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteSubcontractorButton({ subcontractorId, name }: { subcontractorId: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Supprimer ${name} ? Cette action est définitive et retirera aussi ses documents suivis.`)) return;
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="text-[11.5px] font-medium text-rust hover:underline decoration-rust disabled:opacity-60"
      >
        {loading ? "…" : "Supprimer"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
