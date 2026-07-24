"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";

type Doc = { id: string; title: string };
type NewDoc = { title: string; url: string };

export function InviteComposer({
  sessionId,
  dossierId,
  isRemote,
  isInPerson,
  meetingLink,
  mapLink,
  libraryDocuments,
  alreadyInvited,
  defaultSubject,
  defaultBody,
}: {
  sessionId: string;
  dossierId: string;
  isRemote: boolean;
  isInPerson: boolean;
  meetingLink: string | null;
  mapLink: string | null;
  libraryDocuments: Doc[];
  alreadyInvited: boolean;
  defaultSubject: string;
  defaultBody: string;
}) {
  const router = useRouter();
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [newDocs, setNewDocs] = useState<NewDoc[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleAiAssist() {
    setAiLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}/ai-convocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId }),
    });
    const data = await res.json().catch(() => ({}));
    setAiLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erreur inattendue.");
      return;
    }
    setBody(data.draft);
  }

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addDraftDoc() {
    if (!draftTitle.trim() || !draftUrl.trim()) return;
    setNewDocs((prev) => [...prev, { title: draftTitle.trim(), url: draftUrl.trim() }]);
    setDraftTitle("");
    setDraftUrl("");
  }

  function removeDraftDoc(index: number) {
    setNewDocs((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    setSuccess(false);

    const res = await fetch(`/api/planning/sessions/${sessionId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dossierId,
        attachDocumentIds: Array.from(selectedDocIds),
        newDocuments: newDocs,
        subject,
        body,
        includeSignature,
      }),
    });

    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }

    setNewDocs([]);
    setSelectedDocIds(new Set());
    setSuccess(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3.5 pt-2">
      {isRemote && (
        <div className="text-[12px] text-slate">
          {meetingLink ? (
            <>Lien de visioconférence déjà généré pour cette session — il sera inclus dans l&apos;invitation.</>
          ) : (
            <>Un lien de visioconférence sera généré automatiquement à l&apos;envoi.</>
          )}
        </div>
      )}
      {isInPerson && (
        <div className="text-[12px] text-slate">
          {mapLink ? "Le lien d'itinéraire vers le lieu sera inclus dans l'invitation." : "Aucune adresse renseignée sur la session — pensez à la compléter."}
        </div>
      )}

      {isInPerson && (
        <div className="flex flex-col gap-2.5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Pièces jointes</div>

          {libraryDocuments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11.5px] text-slate">Depuis la bibliothèque de l&apos;apprenant</div>
              {libraryDocuments.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.has(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                    className="w-3.5 h-3.5 accent-sage"
                  />
                  {doc.title}
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="text-[11.5px] text-slate">Ajouter un document libre (lien)</div>
            {newDocs.length > 0 && (
              <div className="flex flex-col gap-1">
                {newDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12.5px] text-ink">
                    <span className="flex-1 truncate">{doc.title}</span>
                    <button type="button" onClick={() => removeDraftDoc(i)} className="text-slate hover:text-rust">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Titre"
                className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal w-32"
              />
              <input
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://…"
                className="border border-line rounded-md px-2 py-1 text-[12px] text-ink outline-none focus:border-seal flex-1"
              />
              <button
                type="button"
                onClick={addDraftDoc}
                className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink shrink-0"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Message de convocation</div>
          <button type="button" onClick={handleAiAssist} disabled={aiLoading} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
            {aiLoading ? "…" : "Rédiger avec l'IA"}
          </button>
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Objet"
          className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal resize-none"
        />
        <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !subject.trim() || !body.trim()}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 self-start"
        >
          {sending ? "Envoi…" : alreadyInvited ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
        </button>
        {success && <span className="text-[12px] text-sage">Invitation envoyée.</span>}
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
