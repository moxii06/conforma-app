"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTACT_ONLY_MERGE_TAGS, insertTagAtCursor } from "@/lib/mergeTags";
import { MergeTagButtons } from "@/components/MergeTagButtons";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";

type Intent = "follow_up" | "payment_reminder" | "quote_follow_up" | "custom";

const INTENT_LABELS: Record<Intent, string> = {
  follow_up: "Relance commerciale",
  payment_reminder: "Relance de paiement",
  quote_follow_up: "Relance sur devis",
  custom: "Message libre",
};

export function IntentEmailComposer({ contactId, hasUnpaidInvoice, hasQuote }: { contactId: string; hasUnpaidInvoice: boolean; hasQuote: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<Intent>("follow_up");
  const [instruction, setInstruction] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailSent: boolean } | null>(null);
  const [includeSignature, setIncludeSignature] = useState(true);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<"subject" | "body">("body");

  function insertTag(tag: string) {
    if (activeField.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const { text, cursor } = insertTagAtCursor(el, subject, tag);
      setSubject(text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const { text, cursor } = insertTagAtCursor(el, body, tag);
      setBody(text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    }
  }

  const availableIntents: Intent[] = [
    "follow_up",
    ...(hasUnpaidInvoice ? (["payment_reminder"] as Intent[]) : []),
    ...(hasQuote ? (["quote_follow_up"] as Intent[]) : []),
    "custom",
  ];

  async function handleAiAssist() {
    setAiLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/crm/contacts/${contactId}/ai-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, instruction: intent === "custom" ? instruction : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setAiLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erreur inattendue.");
      return;
    }
    setBody(data.draft);
    if (!subject) setSubject(INTENT_LABELS[intent]);
    setNotice("Brouillon généré par l'IA — relisez avant d'envoyer.");
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/crm/contacts/${contactId}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, includeSignature }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult({ emailSent: data.emailSent });
    setSubject("");
    setBody("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft self-start">
        Envoyer un email
      </button>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className={`text-[12px] ${result.emailSent ? "text-sage" : "text-rust"}`}>
          {result.emailSent ? "Email envoyé." : "Échec de l'envoi — vérifiez la configuration Brevo (voir /integrations)."}
        </div>
        <button
          onClick={() => { setOpen(false); setResult(null); }}
          className="text-[12px] text-slate hover:text-ink self-start"
        >
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 bg-[#EFEDE7] border border-line rounded-md p-3">
      <div className="flex items-center gap-2.5">
        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value as Intent)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
        >
          {availableIntents.map((i) => (
            <option key={i} value={i}>
              {INTENT_LABELS[i]}
            </option>
          ))}
        </select>
        <button onClick={handleAiAssist} disabled={aiLoading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {aiLoading ? "…" : "Rédiger avec l'IA"}
        </button>
      </div>
      {intent === "custom" && (
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Instruction pour l'IA (facultatif si vous rédigez vous-même)"
          className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
        />
      )}
      <MergeTagButtons tags={CONTACT_ONLY_MERGE_TAGS} onInsert={insertTag} />
      <input
        ref={subjectRef}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onFocus={() => (activeField.current = "subject")}
        placeholder="Objet"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
      />
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => (activeField.current = "body")}
        rows={6}
        placeholder="Message…"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
      />
      {notice && <div className="text-[11.5px] text-slate">{notice}</div>}
      <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
      <div className="flex items-center gap-2.5">
        <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {sending ? "…" : "Envoyer"}
        </button>
        <button onClick={() => { setOpen(false); setSubject(""); setBody(""); setError(null); setNotice(null); }} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
