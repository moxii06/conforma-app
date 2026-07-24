"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { MERGE_TAGS } from "@/lib/mergeTags";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";

type Template = { id: string; title: string; category: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// Signature is appended at send time (see includeSignature below) rather
// than baked into the editable message — a plain greeting here, nothing to
// accidentally edit or duplicate.
function defaultMessage(contactFirstName: string): string {
  return `<p>Bonjour ${contactFirstName},</p><p>Veuillez trouver ci-joint le document.</p>`;
}

// Client feedback: a single button that opens a dialog pre-filled with the
// client's info, lets staff edit the text or pick a template from the
// library (or upload a file from their own computer instead), then sends
// it — used both from the dossier's Documents tab and its Communications
// panel (same underlying /api/dossiers/[id]/documents/send). Both the
// document body (mode=template) and the accompanying email message are
// rich text (bold/italic/highlight/font) via RichTextEditor — the message
// is pre-filled with a greeting and the sender's own signature (set on
// /profil), matching "avec la signature" from the client's spec.
export function SendDocumentDialog({
  dossierId,
  templates,
  contactFirstName,
  signatureHtml,
}: {
  dossierId: string;
  templates: Template[];
  contactFirstName: string;
  signatureHtml: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "upload">("template");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyResetKey, setBodyResetKey] = useState(0);
  const [message, setMessage] = useState(() => defaultMessage(contactFirstName));
  const [messageResetKey, setMessageResetKey] = useState(0);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [category, setCategory] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ emailSent: boolean; documentUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePickTemplate(id: string) {
    setTemplateId(id);
    setError(null);
    if (!id) {
      setTitle("");
      setBodyHtml("");
      setBodyResetKey((k) => k + 1);
      return;
    }
    setLoadingPreview(true);
    const res = await fetch(`/api/dossiers/${dossierId}/documents/preview-template?templateId=${id}`);
    setLoadingPreview(false);
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
    setMessage(defaultMessage(contactFirstName));
    setMessageResetKey((k) => k + 1);
    setIncludeSignature(true);
    setCategory("other");
    setFile(null);
    setRequiresSignature(false);
    setResult(null);
    setError(null);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("title", title);
    formData.set("category", category);
    formData.set("message", includeSignature ? message + signatureHtml : message);
    formData.set("requiresSignature", String(requiresSignature));
    if (mode === "template") {
      formData.set("templateId", templateId);
      formData.set("bodyText", bodyHtml);
    } else {
      if (file) formData.set("file", file);
    }

    const res = await fetch(`/api/dossiers/${dossierId}/documents/send`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult({ emailSent: body.emailSent, documentUrl: body.documentUrl });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        Envoyer un document
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
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
            <div className="text-[12.5px] text-sage">
              {result.emailSent ? "Document envoyé par email, en pièce jointe." : "Document créé — email non envoyé, lien à transmettre :"}
            </div>
            <a href={result.documentUrl} target="_blank" rel="noreferrer" className="text-[12px] text-ink underline break-all">
              {result.documentUrl}
            </a>
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
          <form onSubmit={handleSend} className="flex flex-col gap-3">
            <div className="flex gap-1.5">
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
                  placeholder={loadingPreview ? "Chargement…" : "Sélectionnez un modèle pour préremplir le texte, puis adaptez-le si besoin."}
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
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                  className="text-[12px] text-ink"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Message accompagnant l&apos;envoi</div>
              <RichTextEditor html={message} onChange={setMessage} resetKey={messageResetKey} placeholder="Votre message…" mergeTags={MERGE_TAGS} />
              <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
            </div>

            <label className="flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={requiresSignature}
                onChange={(e) => setRequiresSignature(e.target.checked)}
                className="accent-sage"
              />
              Demander une signature électronique pour ce document
            </label>

            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                disabled={sending || !title.trim() || (mode === "template" && !stripHtml(bodyHtml)) || (mode === "upload" && !file)}
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
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
