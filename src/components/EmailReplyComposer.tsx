"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTACT_ONLY_MERGE_TAGS, insertTagAtCursor } from "@/lib/mergeTags";
import { MergeTagButtons } from "@/components/MergeTagButtons";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";

export function EmailReplyComposer({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: boolean; sendError: string | null } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function insertTag(tag: string) {
    const el = textRef.current;
    const { text: next, cursor } = insertTagAtCursor(el, text, tag);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  async function handleAiAssist() {
    setAiLoading(true);
    setAiNotice(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/ai-draft`, { method: "POST" });
    setAiLoading(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAiNotice(body.error ?? "Erreur inattendue.");
      return;
    }
    setText(body.draft);
    setAiNotice("Brouillon généré par l'IA — relisez avant d'envoyer.");
  }

  async function handleSend() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch(`/api/inbox/messages/${messageId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, includeSignature }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    const created = await res.json();
    setText("");
    setResult({ delivered: created.delivered, sendError: created.sendError });
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        Répondre
      </button>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-1.5 mt-1">
        {result.delivered ? (
          <div className="text-[11.5px] text-sage">Réponse envoyée via Gmail.</div>
        ) : result.sendError ? (
          <div className="text-[11.5px] text-rust">
            Réponse enregistrée dans Conforma, mais l&apos;envoi via Gmail a échoué : {result.sendError}
          </div>
        ) : (
          <div className="text-[11.5px] text-slate">
            Réponse enregistrée dans Conforma — pas d&apos;envoi réel, aucune boîte mail n&apos;est connectée (voir /integrations).
          </div>
        )}
        <button onClick={() => { setOpen(false); setResult(null); }} className="text-[12px] text-slate hover:text-ink self-start">
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <MergeTagButtons tags={CONTACT_ONLY_MERGE_TAGS} onInsert={insertTag} />
      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Votre réponse…"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
      />
      {aiNotice && <div className="text-[11.5px] text-slate">{aiNotice}</div>}
      <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
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
    </div>
  );
}
