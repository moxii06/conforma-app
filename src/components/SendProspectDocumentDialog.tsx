"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { plainTextToHtml } from "@/lib/plainTextToHtml";

type Template = { id: string; title: string; category: string };
type Mode = "template" | "upload";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function defaultMessage(contactFirstName: string, signatureHtml: string): string {
  return `<p>Bonjour ${contactFirstName},</p><p>Veuillez trouver ci-joint le document.</p><p><br></p>${signatureHtml}`;
}

// Client feedback: "recueil des besoins" used to be its own dedicated tab
// with its own send flow — now it's just another entry in the template
// library (it already is one — see prisma/lib/seed-base.ts's starter
// templates), picked the same way as any other document. Selecting that
// specific template swaps the submit target to the existing
// NeedsAssessmentRequest flow (a fillable public link, not a static
// PDF) instead of the generic document-send route — the interactive
// position-test behavior is preserved, only the entry point is unified.
export function SendProspectDocumentDialog({
  opportunityId,
  alreadySentNeedsAssessment,
  templates,
  contactFirstName,
  signatureHtml,
}: {
  opportunityId: string;
  alreadySentNeedsAssessment: boolean;
  templates: Template[];
  contactFirstName: string;
  signatureHtml: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("template");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyResetKey, setBodyResetKey] = useState(0);
  const [message, setMessage] = useState(() => defaultMessage(contactFirstName, signatureHtml));
  const [messageResetKey, setMessageResetKey] = useState(0);
  const [category, setCategory] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message: string; link?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const isNeedsAssessment = mode === "template" && selectedTemplate?.category === "needs_assessment";

  async function handlePickTemplate(id: string) {
    setTemplateId(id);
    setError(null);
    if (!id) {
      setTitle("");
      setBodyHtml("");
      setBodyResetKey((k) => k + 1);
      return;
    }
    const template = templates.find((t) => t.id === id);
    if (template?.category === "needs_assessment") return; // no preview needed — it's a link, not a document
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/documents/preview-template?templateId=${id}`);
    if (!res.ok) {
      setError("Impossible de charger le modèle.");
      return;
    }
    const data = await res.json();
    setTitle(data.title);
    setBodyHtml(plainTextToHtml(data.bodyText));
    setBodyResetKey((k) => k + 1);
    setCategory(data.category);
  }

  function reset() {
    setMode("template");
    setTemplateId("");
    setTitle("");
    setBodyHtml("");
    setBodyResetKey((k) => k + 1);
    setMessage(defaultMessage(contactFirstName, signatureHtml));
    setMessageResetKey((k) => k + 1);
    setCategory("other");
    setFile(null);
    setResult(null);
    setError(null);
  }

  async function handleSendNeedsAssessment(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/send-needs-assessment`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'envoi.");
      return;
    }
    const body = await res.json();
    setResult({ message: body.emailSent ? "Recueil envoyé par email." : "Recueil créé — email non envoyé, lien à transmettre :", link: body.formUrl });
    router.refresh();
  }

  async function handleSendDocument(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("title", title);
    formData.set("category", category);
    formData.set("message", message);
    if (mode === "template") {
      formData.set("templateId", templateId);
      formData.set("bodyText", bodyHtml);
    } else if (file) {
      formData.set("file", file);
    }

    const res = await fetch(`/api/crm/opportunities/${opportunityId}/documents/send`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult({ message: body.emailSent ? "Document envoyé par email, en pièce jointe." : "Document créé — email non envoyé, lien à transmettre :", link: body.documentUrl });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-[11px] font-medium text-ink underline decoration-line hover:decoration-ink text-left"
      >
        Envoyer
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Envoyer un document</div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-slate hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-sage">{result.message}</div>
            {result.link && (
              <a href={result.link} target="_blank" rel="noreferrer" className="text-[12px] text-ink underline break-all">
                {result.link}
              </a>
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
          <>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setMode("template")}
                className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 border ${mode === "template" ? "bg-ink text-white border-ink" : "border-line text-slate hover:text-ink"}`}
              >
                Depuis la bibliothèque
              </button>
              <button
                type="button"
                onClick={() => setMode("upload")}
                className={`text-[12px] font-medium rounded-md px-2.5 py-1.5 border ${mode === "upload" ? "bg-ink text-white border-ink" : "border-line text-slate hover:text-ink"}`}
              >
                Depuis mon ordinateur
              </button>
            </div>

            <form onSubmit={isNeedsAssessment ? handleSendNeedsAssessment : handleSendDocument} className="flex flex-col gap-3">
              {mode === "template" && (
                <select
                  value={templateId}
                  onChange={(e) => handlePickTemplate(e.target.value)}
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  <option value="">Choisir un modèle…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {CATEGORY_LABELS[t.category] ?? t.category} — {t.title}
                    </option>
                  ))}
                </select>
              )}

              {isNeedsAssessment ? (
                <div className="text-[12px] text-slate">
                  {alreadySentNeedsAssessment
                    ? "Un recueil a déjà été envoyé — ceci renverra un nouveau lien."
                    : "Envoie un lien vers un formulaire en ligne que le prospect complète lui-même — pas de pièce jointe."}
                </div>
              ) : (
                <>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titre du document"
                    required
                    className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                  />

                  {mode === "template" ? (
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] text-slate uppercase tracking-wide">Contenu du document (PDF envoyé en pièce jointe)</div>
                      <RichTextEditor
                        html={bodyHtml}
                        onChange={setBodyHtml}
                        resetKey={bodyResetKey}
                        placeholder="Sélectionnez un modèle pour préremplir le texte, puis adaptez-le si besoin."
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                      >
                        {DOCUMENT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required className="text-[12px] text-ink" />
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] text-slate uppercase tracking-wide">Message accompagnant l&apos;envoi</div>
                    <RichTextEditor html={message} onChange={setMessage} resetKey={messageResetKey} placeholder="Votre message…" />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={
                    sending ||
                    (mode === "template" && !templateId) ||
                    (!isNeedsAssessment && (!title.trim() || (mode === "template" && !stripHtml(bodyHtml)) || (mode === "upload" && !file)))
                  }
                  className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
                >
                  {sending ? "Envoi…" : "Envoyer au client"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="text-[12.5px] text-slate hover:text-ink"
                >
                  Annuler
                </button>
              </div>
            </form>
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
