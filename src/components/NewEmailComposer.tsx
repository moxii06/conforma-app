"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MERGE_TAGS, CONTACT_ONLY_MERGE_TAGS, insertTagAtCursor } from "@/lib/mergeTags";
import { MergeTagButtons } from "@/components/MergeTagButtons";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { Button } from "@/components/ui";

// A brand-new outgoing email to this contact — distinct from
// EmailReplyComposer, which only replies to an existing "in" message.
// Client feedback: staff need to be able to start a fresh message from
// right where they're looking at the contact, not only reply to something
// already received. dossierId (only passed from the dossier record) widens
// the merge tags to include the formation/session ones.
export function NewEmailComposer({ contactId, dossierId }: { contactId: string; dossierId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: boolean } | null>(null);
  const [includeSignature, setIncludeSignature] = useState(true);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<"subject" | "body">("body");

  const tags = dossierId ? MERGE_TAGS : CONTACT_ONLY_MERGE_TAGS;

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

  function reset() {
    setSubject("");
    setBody("");
    setError(null);
    setResult(null);
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, dossierId, includeSignature }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult({ delivered: data.delivered });
    setSubject("");
    setBody("");
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="self-start mb-3">
        + Nouveau message
      </Button>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-1.5 mb-3">
        {result.delivered ? (
          <div className="text-[11.5px] text-sage">Email envoyé.</div>
        ) : (
          <div className="text-[11.5px] text-rust">Échec de l&apos;envoi — vérifiez la configuration Brevo (voir /integrations).</div>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[11.5px] text-slate hover:text-ink self-start"
        >
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-line rounded-md p-3 bg-mist mb-3">
      <MergeTagButtons tags={tags} onInsert={insertTag} />
      <input
        ref={subjectRef}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onFocus={() => (activeField.current = "subject")}
        placeholder="Objet"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
      />
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => (activeField.current = "body")}
        rows={5}
        placeholder="Votre message…"
        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none bg-white"
      />
      <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          size="sm"
          onClick={handleSend}
          disabled={sending || !subject.trim() || !body.trim()}
        >
          {sending ? "…" : "Envoyer"}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Annuler
        </Button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </div>
  );
}
