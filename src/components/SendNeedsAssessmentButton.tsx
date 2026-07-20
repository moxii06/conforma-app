"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SendNeedsAssessmentButton({ opportunityId, alreadySent }: { opportunityId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.MouseEvent) {
    e.stopPropagation();
    setSending(true);
    setError(null);
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/send-needs-assessment`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    const body = await res.json();
    setLink(body.formUrl);
    router.refresh();
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1">
      <button
        onClick={handleSend}
        disabled={sending}
        className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60 text-left"
      >
        {sending ? "Envoi…" : alreadySent ? "Renvoyer le recueil des besoins" : "Envoyer le recueil des besoins"}
      </button>
      {link && (
        <div className="text-[10.5px] text-slate break-all">
          Lien (aucun email envoyé — spec §3) : <a href={link} target="_blank" rel="noreferrer" className="underline">{link}</a>
        </div>
      )}
      {error && <div className="text-[10.5px] text-rust">{error}</div>}
    </div>
  );
}
