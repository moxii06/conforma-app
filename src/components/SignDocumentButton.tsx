"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSign() {
    if (!confirm(`Vous allez signer électroniquement « ${title} ». Confirmer ?`)) return;
    setSigning(true);
    setError(null);
    const res = await fetch(`/api/documents/${documentId}/sign`, { method: "POST" });
    setSigning(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la signature.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSign}
        disabled={signing}
        className="bg-sage text-white text-[11.5px] font-medium rounded-md px-2.5 py-1 hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
      >
        {signing ? "…" : "Signer"}
      </button>
      {error && <span className="text-[11px] text-rust">{error}</span>}
    </div>
  );
}
