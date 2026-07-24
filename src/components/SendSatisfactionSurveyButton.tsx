"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SURVEY_KIND_LABELS, type SurveyKind } from "@/lib/satisfactionSurveys";

export function SendSatisfactionSurveyButton({ dossierId, kind }: { dossierId: string; kind: SurveyKind }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/dossiers/${dossierId}/satisfaction-surveys/${kind}/send`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="border border-line rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink-soft disabled:opacity-60"
      >
        {loading ? "…" : `Envoyer l'${SURVEY_KIND_LABELS[kind].toLowerCase()}`}
      </button>
      {error && <span className="text-[11px] text-rust mt-1">{error}</span>}
    </div>
  );
}
