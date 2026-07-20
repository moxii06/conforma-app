"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EmailReplyComposer({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  async function handleAiAssist() {
    setAiLoading(true);
    setAiNotice(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/ai-draft`, { method: "POST" });
    setAiLoading(false);
    const body = await res.json().catch(() => ({}));
    setAiNotice(body.error ?? "Erreur inattendue.");
  }

  async function handleSend() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/reply`, {
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
    setText("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Répondre
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Votre réponse…"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
      />
      {aiNotice && <div className="text-[11.5px] text-slate">{aiNotice}</div>}
      <div className="flex items-center gap-2.5">
        <button onClick={handleSend} disabled={loading || !text.trim()} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "…" : "Envoyer"}
        </button>
        <button onClick={handleAiAssist} disabled={aiLoading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {aiLoading ? "…" : "Assister avec l'IA"}
        </button>
        <button onClick={() => { setOpen(false); setText(""); setError(null); setAiNotice(null); }} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
      <div className="text-[11px] text-slate">
        Réponse enregistrée dans Conforma — pas d&apos;envoi réel tant qu&apos;aucune boîte mail n&apos;est connectée (voir /integrations).
      </div>
    </div>
  );
}
