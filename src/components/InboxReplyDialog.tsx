"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Paperclip } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { LibraryPanel } from "@/components/LibraryPanel";
import { CONTACT_ONLY_MERGE_TAGS } from "@/lib/mergeTags";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { Button } from "@/components/ui";
import { DialogShell } from "@/components/DialogShell";

type ExistingDocument = { id: string; title: string; category: string; createdAt: string };
type PickedTemplate = { id: string; title: string };

function defaultMessage(firstName: string | null): string {
  return `<p>Bonjour${firstName ? ` ${firstName}` : ""},</p><p></p>`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// A real dialog (not the inline textarea EmailReplyComposer uses elsewhere
// in the app) — client feedback wanted replying from the inbox triage
// screen itself, "comme pour le reste" (SendDocumentDialog's pattern), plus
// attachments. Deliberately NOT the "draft your own PDF" experience
// SendDocumentDialog offers in its template mode: this only ever composes
// a message (rich text — fonts, bold, etc. via RichTextEditor) and attaches
// files, never edits a document body into being. Attachments come from
// three sources: the computer (plain upload), documents already on file
// for this contact (re-attached as-is, nothing regenerated), and the
// template library for a fresh PDF — restricted to non-conditional
// templates, since resolving a conditional one needs a dossier's session/
// funding context this screen doesn't have (see the reply route).
export function InboxReplyDialog({
  messageId,
  fromName,
  contactFirstName,
  hasContact,
  signatureHtml,
}: {
  messageId: string;
  fromName: string | null;
  contactFirstName: string | null;
  /**
   * Ouvre la moitié « documents » (pièces déjà au dossier du contact +
   * génération depuis un modèle).
   *
   * Vaut false chez l'unique appelant actuel, InboxTriageSplitView : le
   * triage ne liste par construction que les messages SANS contact. Cette
   * moitié n'est donc pas encore atteignable — elle le deviendra le jour où
   * cette fenêtre remplacera EmailReplyComposer sur la fiche contact et la
   * fiche dossier, qui répondent aujourd'hui sans aucune pièce jointe.
   * Gardée plutôt que supprimée pour cette raison, et parce que la route
   * qu'elle appelle (/api/inbox/messages/[id]/documents) est écrite.
   */
  hasContact: boolean;
  signatureHtml: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(() => defaultMessage(contactFirstName));
  const [resetKey, setResetKey] = useState(0);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [existingDocuments, setExistingDocuments] = useState<ExistingDocument[] | null>(null);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);
  const [pickedTemplates, setPickedTemplates] = useState<PickedTemplate[]>([]);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: boolean; sendError: string | null } | null>(null);

  useEffect(() => {
    if (open && hasContact && existingDocuments === null) {
      fetch(`/api/inbox/messages/${messageId}/documents`)
        .then((r) => (r.ok ? r.json() : { documents: [] }))
        .then((data) => setExistingDocuments(data.documents ?? []));
    }
  }, [open, hasContact, existingDocuments, messageId]);

  async function handlePickTemplate(template: { id: string; title: string; category: string }) {
    setTemplateNotice(null);
    const res = await fetch(`/api/documents/templates/${template.id}`);
    if (!res.ok) return;
    const detail = await res.json();
    if (detail.blocks && detail.blocks.length > 0) {
      setTemplateNotice(
        `« ${template.title} » varie selon le dossier (dates, financement…) — indisponible ici. Envoyez-le depuis la fiche dossier du contact.`,
      );
      return;
    }
    setPickedTemplates((prev) => (prev.some((t) => t.id === template.id) ? prev : [...prev, { id: template.id, title: template.title }]));
  }

  function reset() {
    setMessage(defaultMessage(contactFirstName));
    setResetKey((k) => k + 1);
    setIncludeSignature(true);
    setLocalFiles([]);
    setSelectedExistingIds([]);
    setPickedTemplates([]);
    setTemplateNotice(null);
    setError(null);
    setResult(null);
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    const formData = new FormData();
    formData.set("bodyHtml", includeSignature ? message + signatureHtml : message);
    if (selectedExistingIds.length > 0) formData.set("existingDocumentIds", JSON.stringify(selectedExistingIds));
    if (pickedTemplates.length > 0) formData.set("templateIds", JSON.stringify(pickedTemplates.map((t) => t.id)));
    for (const file of localFiles) formData.append("files", file);

    const res = await fetch(`/api/inbox/messages/${messageId}/reply`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult({ delivered: body.delivered, sendError: body.sendError });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        Répondre
      </button>
    );
  }

  return (
    <DialogShell
      title={fromName ? `Répondre à ${fromName}` : "Répondre"}
      onClose={() => {
        setOpen(false);
        reset();
      }}
      maxWidth="max-w-2xl"
    >

        {result ? (
          <div className="flex flex-col gap-2">
            {result.delivered ? (
              <div className="text-[12.5px] text-sage">Réponse envoyée.</div>
            ) : result.sendError ? (
              <div className="text-[12.5px] text-rust">
                Réponse enregistrée dans Jalon, mais l&apos;envoi a échoué : {result.sendError}
              </div>
            ) : (
              <div className="text-[12.5px] text-slate">
                Réponse enregistrée dans Jalon — pas d&apos;envoi réel, aucune boîte mail n&apos;est connectée (voir /integrations).
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="self-start text-[12.5px] text-slate hover:text-ink mt-1"
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <RichTextEditor
              html={message}
              onChange={setMessage}
              resetKey={resetKey}
              placeholder="Votre réponse…"
              mergeTags={CONTACT_ONLY_MERGE_TAGS}
            />
            <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />

            <div className="border-t border-line pt-3 flex flex-col gap-2.5">
              <div className="text-[11px] text-slate uppercase tracking-wide">Pièces jointes</div>

              <div className="flex flex-col gap-1.5">
                <input
                  type="file"
                  multiple
                  onChange={(e) => setLocalFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                  className="text-[12px] text-ink"
                />
                {localFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {localFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1.5 bg-linen border border-line rounded-md px-2 py-1 text-[11.5px] text-ink"
                      >
                        <Paperclip size={11} className="text-slate shrink-0" />
                        {f.name} <span className="text-slate">{formatSize(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setLocalFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-slate hover:text-rust"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Le texte disait « rattachez ce message à un contact pour
                  joindre un document » — un parcours qui se referme sur
                  lui-même : rattacher fait sortir le message du triage
                  (contactId n'est plus nul, voir le where de /inbox), donc
                  cette fenêtre devient inatteignable, et la réponse se fait
                  ensuite depuis la fiche du contact, où le composeur n'offre
                  aucune pièce jointe. On dit maintenant ce qui est possible
                  ici et ce qui ne l'est pas, sans envoyer dans une impasse. */}
              {!hasContact && (
                <div className="text-[11px] text-slate">
                  Ce message n&apos;est rattaché à aucun contact : seuls des fichiers de votre ordinateur peuvent être
                  joints ici. Un document déjà au dossier, ou généré depuis un modèle, s&apos;envoie depuis la fiche du
                  contact ou du dossier.
                </div>
              )}

              {hasContact && (
                <div className="flex flex-col gap-2">
                  {existingDocuments && existingDocuments.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] text-slate">Documents déjà au dossier de ce contact</div>
                      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto border border-line rounded-md p-2">
                        {existingDocuments.map((doc) => (
                          <label key={doc.id} className="flex items-center gap-2 text-[12px] text-ink">
                            <input
                              type="checkbox"
                              checked={selectedExistingIds.includes(doc.id)}
                              onChange={(e) =>
                                setSelectedExistingIds((prev) =>
                                  e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id),
                                )
                              }
                              className="accent-sage"
                            />
                            {doc.title}
                            <span className="text-slate">— {CATEGORY_LABELS[doc.category] ?? doc.category}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-[11.5px] text-slate">
                    <span>Générer depuis un modèle :</span>
                    <LibraryPanel label="Ouvrir la bibliothèque" useLabel="Joindre" onUse={handlePickTemplate} />
                  </div>
                  {pickedTemplates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pickedTemplates.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1.5 bg-linen border border-line rounded-md px-2 py-1 text-[11.5px] text-ink"
                        >
                          <Paperclip size={11} className="text-slate shrink-0" />
                          {t.title}
                          <button
                            type="button"
                            onClick={() => setPickedTemplates((prev) => prev.filter((p) => p.id !== t.id))}
                            className="text-slate hover:text-rust"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {templateNotice && <div className="text-[11px] text-slate">{templateNotice}</div>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 border-t border-line pt-3">
              <Button size="sm" onClick={handleSend} disabled={sending}>
                {sending ? "Envoi…" : "Envoyer"}
              </Button>
              <Button
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
        )}
    </DialogShell>
  );
}
