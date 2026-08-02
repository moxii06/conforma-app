"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { MERGE_TAGS } from "@/lib/mergeTags";
import { LibraryPanel } from "@/components/LibraryPanel";

type Template = { id: string; title: string; category: string };
type Recipient = { id: string; name: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// QW9 — bulk counterpart to SendDocumentDialog: same "template from the
// library or upload from my computer" choice, but targets a checkbox
// selection of a session's enrolled learners instead of one dossier. The
// message uses [Prénom]-style merge tags (same as the single-send dialog)
// since it's personalized per recipient server-side — see
// /api/planning/sessions/[id]/documents/send-bulk.
export function SendBulkDocumentDialog({
  sessionId,
  templates,
  recipients,
  signatureHtml,
}: {
  sessionId: string;
  templates: Template[];
  recipients: Recipient[];
  // Résolue côté serveur depuis le profil de l'expéditeur — voir
  // SignatureCheckbox et emailSignature.ts.
  signatureHtml: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "upload">("template");
  const [templateId, setTemplateId] = useState("");
  const [panelTemplates, setPanelTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyResetKey, setBodyResetKey] = useState(0);
  const [message, setMessage] = useState("<p>Bonjour [Prénom],</p><p>Veuillez trouver ci-joint le document.</p>");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [category, setCategory] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(recipients.map((r) => r.id)));
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sentCount: number; emailFailedCount: number; recipientCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    const res = await fetch(`/api/planning/sessions/${sessionId}/documents/preview-template?templateId=${id}`);
    setLoadingPreview(false);
    if (!res.ok) {
      setError("Impossible de charger le modèle.");
      return;
    }
    const data = await res.json();
    setTitle(data.title);
    setBodyHtml(`<p>${data.bodyText.split("\n").join("</p><p>")}</p>`);
    setBodyResetKey((k) => k + 1);
    setCategory(data.category);
  }

  function reset() {
    setMode("template");
    setTemplateId("");
    setTitle("");
    setBodyHtml("");
    setBodyResetKey((k) => k + 1);
    setMessage("<p>Bonjour [Prénom],</p><p>Veuillez trouver ci-joint le document.</p>");
    setIncludeSignature(true);
    setCategory("other");
    setFile(null);
    setSelected(new Set(recipients.map((r) => r.id)));
    setResult(null);
    setError(null);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Sélectionnez au moins un apprenant.");
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("title", title);
    formData.set("category", category);
    formData.set("message", includeSignature ? message + signatureHtml : message);
    for (const id of selected) formData.append("dossierIds", id);
    if (mode === "template") {
      formData.set("templateId", templateId);
      formData.set("bodyText", bodyHtml);
    } else {
      if (file) formData.set("file", file);
    }

    const res = await fetch(`/api/planning/sessions/${sessionId}/documents/send-bulk`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult(body);
    router.refresh();
  }

  if (recipients.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-line rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink-soft"
      >
        Envoyer à plusieurs apprenants
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Envoyer un document à plusieurs apprenants</div>
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
              {result.sentCount}/{result.recipientCount} email(s) envoyé(s)
              {result.emailFailedCount > 0 && ` — ${result.emailFailedCount} échec(s) d'envoi (document quand même créé, à transmettre manuellement).`}
            </div>
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
            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Destinataires ({selected.size}/{recipients.length})</div>
              <div className="border border-line rounded-md p-2 max-h-32 overflow-y-auto flex flex-col gap-1">
                {recipients.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-sage" />
                    {r.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setSelected(new Set(recipients.map((r) => r.id)))} className="text-[11.5px] text-slate hover:text-ink underline decoration-line">
                  Tout sélectionner
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-[11.5px] text-slate hover:text-ink underline decoration-line">
                  Tout désélectionner
                </button>
              </div>
            </div>

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
              <div className="flex flex-col gap-1.5">
                <select
                  value={templateId}
                  onChange={(e) => handlePickTemplate(e.target.value)}
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  <option value="">Choisir un modèle…</option>
                  {[...templates, ...panelTemplates.filter((p) => !templates.some((t) => t.id === p.id))].map((t) => (
                    <option key={t.id} value={t.id}>
                      {CATEGORY_LABELS[t.category] ?? t.category} — {t.title}
                    </option>
                  ))}
                </select>
                {/* Same dead end as the single-recipient dialog: the list
                    above only offers what already exists. */}
                <div className="flex items-center gap-1.5 text-[11.5px] text-slate">
                  <span>Le modèle n&apos;existe pas encore ?</span>
                  <LibraryPanel
                    label="Ouvrir la bibliothèque"
                    useLabel="Choisir"
                    onUse={(t) => {
                      setPanelTemplates((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t]));
                      void handlePickTemplate(t.id);
                    }}
                  />
                </div>
              </div>
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
                <div className="text-[11px] text-slate uppercase tracking-wide">Contenu du document (PDF envoyé en pièce jointe, identique pour tous)</div>
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
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required className="text-[12px] text-ink" />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Message accompagnant l&apos;envoi (personnalisé par apprenant)</div>
              <RichTextEditor html={message} onChange={setMessage} placeholder="Votre message…" mergeTags={MERGE_TAGS} />
              <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                disabled={sending || !title.trim() || selected.size === 0 || (mode === "template" && !stripHtml(bodyHtml)) || (mode === "upload" && !file)}
                className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
              >
                {sending ? "Envoi…" : `Envoyer à ${selected.size} apprenant${selected.size > 1 ? "s" : ""}`}
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
