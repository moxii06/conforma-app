"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReplyToComplaintDialog({ complaintId }: { complaintId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: boolean; sendError: string | null } | null>(null);

  async function handleSend() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/complaints/${complaintId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    const body = await res.json();
    setText("");
    setResult(body);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
        Répondre
      </button>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-1.5">
        {result.delivered ? (
          <div className="text-[11.5px] text-sage">Réponse envoyée par email.</div>
        ) : (
          <div className="text-[11.5px] text-rust">Échec de l&apos;envoi : {result.sendError}</div>
        )}
        <button type="button" onClick={() => { setOpen(false); setResult(null); }} className="text-[11.5px] text-slate hover:text-ink self-start">
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Votre réponse…"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
      />
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={handleSend} disabled={loading || !text.trim()} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Envoyer"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setText(""); setError(null); }} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
