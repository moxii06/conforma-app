"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowLeft, FileText, FileDown } from "lucide-react";
import { SHORT_OPTION_LABELS, type QuestionDefinition, type QuestionKey } from "@/lib/documentQuestionnaire";
import { TemplateBlocksEditor, type BlockRow } from "@/components/TemplateBlocksEditor";
import { TemplateEditor } from "@/components/TemplateEditor";
import { ActivateBlocksButton } from "@/components/ActivateBlocksButton";

/**
 * The "Adapter ce modèle" flow, rebuilt as a dialog — client feedback: the
 * click used to fork silently and refresh the page, and browsing a template
 * meant scrolling every legal clause. What an OFP actually wants first is
 * the QUESTIONS (présentiel/distance, particulier/entreprise…), a preview,
 * and a file they can take away (Word to keep editing, PDF to print). The
 * clause-by-clause legal editor still exists but behind a deliberately
 * discreet link — it's the exception, not the path.
 *
 * Steps: questions (skipped when the template has no conditional blocks)
 * → preview + downloads → optionally "legal" (the block/flat editor).
 * Editing a Jalon starter template forks it into the org's library first
 * (same idempotent /fork route as before) — downloads alone never fork.
 */
export function AdaptTemplateDialog({
  templateId,
  title,
  triggerLabel,
  questions,
  isGlobal,
  fork,
  bodyText,
  blocks,
}: {
  templateId: string;
  title: string;
  triggerLabel: string;
  /** Only the questions this template's blocks actually branch on. */
  questions: QuestionDefinition[];
  isGlobal: boolean;
  /** The org's existing fork of a global template, with its CURRENT
   *  content — editing must start from this, never from the pristine
   *  global blocks, or saving would silently revert their changes. */
  fork?: { id: string; bodyText: string; blocks: BlockRow[] } | null;
  bodyText: string;
  blocks: BlockRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"questions" | "preview" | "legal">("questions");
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once "Modifier le texte juridique" has ensured an editable copy.
  const [editTarget, setEditTarget] = useState<{ id: string; bodyText: string; blocks: BlockRow[] } | null>(null);

  const hasQuestions = questions.length > 0;

  async function fetchPreview(withAnswers: Partial<Record<QuestionKey, string>>) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/documents/templates/${templateId}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: withAnswers, format: "text" }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Impossible d'assembler le modèle.");
      return;
    }
    const data = await res.json();
    setPreview(data.bodyText);
    setStep("preview");
  }

  async function handleOpen() {
    setOpen(true);
    setAnswers({});
    setPreview(null);
    setError(null);
    setEditTarget(null);
    if (hasQuestions) {
      setStep("questions");
    } else {
      setStep("preview");
      await fetchPreview({});
    }
  }

  function close() {
    setOpen(false);
  }

  async function handleDownload(format: "docx" | "pdf") {
    setDownloading(format);
    setError(null);
    const res = await fetch(`/api/documents/templates/${templateId}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, format }),
    });
    setDownloading(null);
    if (!res.ok) {
      setError("Le téléchargement a échoué.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleEditLegal() {
    setError(null);
    if (!isGlobal) {
      setEditTarget({ id: templateId, bodyText, blocks });
      setStep("legal");
      return;
    }
    if (fork) {
      setEditTarget(fork);
      setStep("legal");
      return;
    }
    // First edit of a Jalon template: fork it into the org's library. The
    // fork's content is identical to the global's at this instant, so the
    // props' blocks/bodyText are the right editor seed.
    setLoading(true);
    const res = await fetch(`/api/documents/templates/${templateId}/fork`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Impossible de créer votre copie du modèle.");
      return;
    }
    const created = await res.json();
    setEditTarget({ id: created.id, bodyText, blocks });
    setStep("legal");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink truncate">{title}</div>
            <div className="text-[11px] text-slate mt-0.5">
              {step === "questions" && "Personnalisez le modèle en quelques réponses."}
              {step === "preview" && "Aperçu du modèle adapté — vos informations d'organisme sont préremplies."}
              {step === "legal" && "Texte juridique du modèle — réservé aux ajustements de fond."}
            </div>
          </div>
          <button type="button" onClick={close} className="text-slate hover:text-ink shrink-0">
            <X size={16} />
          </button>
        </div>

        {step === "questions" && (
          <div className="flex flex-col gap-3">
            {questions.map((q) => (
              <div key={q.key} className="flex flex-col gap-1">
                <label className="text-[12px] text-ink font-medium">{q.label}</label>
                {q.hint && <div className="text-[11px] text-slate">{q.hint}</div>}
                <select
                  value={answers[q.key] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  <option value="">Choisir…</option>
                  {q.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fetchPreview(answers)}
              disabled={loading || questions.some((q) => !answers[q.key])}
              className="self-start bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
            >
              {loading ? "…" : "Voir le modèle adapté"}
            </button>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3">
            {hasQuestions && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStep("questions")}
                  className="inline-flex items-center gap-1 text-[11.5px] text-slate hover:text-ink"
                >
                  <ArrowLeft size={12} /> Modifier les réponses
                </button>
                {Object.entries(answers).map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-sage bg-[#DEE5E0] rounded-md px-1.5 py-0.5"
                  >
                    ✓ {SHORT_OPTION_LABELS[key]?.[value ?? ""] ?? value}
                  </span>
                ))}
              </div>
            )}

            {loading ? (
              <div className="text-[12px] text-slate">Assemblage…</div>
            ) : preview != null ? (
              <pre className="whitespace-pre-wrap text-[12px] text-slate font-sans leading-relaxed bg-linen border border-line rounded-md p-3.5 max-h-[38vh] overflow-y-auto">
                {preview}
              </pre>
            ) : null}

            <div className="text-[11px] text-slate">
              Les champs entre <code className="bg-pebble rounded px-1 py-0.5 text-[10px]">{"{{…}}"}</code> (apprenant,
              dates, formation) se remplissent automatiquement à la génération pour un dossier — ou à la main si vous
              utilisez le fichier téléchargé.
            </div>

            <div className="flex items-center gap-2.5 flex-wrap border-t border-line pt-3">
              <button
                type="button"
                onClick={() => handleDownload("docx")}
                disabled={downloading != null || loading}
                className="inline-flex items-center gap-1.5 bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60"
              >
                <FileText size={13} /> {downloading === "docx" ? "…" : "Télécharger en Word"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload("pdf")}
                disabled={downloading != null || loading}
                className="inline-flex items-center gap-1.5 border border-line text-ink text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:border-ink-soft disabled:opacity-60"
              >
                <FileDown size={13} /> {downloading === "pdf" ? "…" : "Télécharger en PDF"}
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleEditLegal}
                disabled={loading}
                className="text-[11px] text-slate underline decoration-line hover:text-ink hover:decoration-ink disabled:opacity-60"
              >
                Modifier le texte juridique
              </button>
            </div>
          </div>
        )}

        {step === "legal" && editTarget && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setStep("preview")}
              className="inline-flex items-center gap-1 text-[11.5px] text-slate hover:text-ink self-start"
            >
              <ArrowLeft size={12} /> Retour à l&apos;aperçu
            </button>
            {isGlobal && (
              <div className="text-[11px] text-slate bg-linen border border-line rounded-md px-2.5 py-2">
                Vous modifiez votre copie du modèle (dans « Documents généraux ») — le modèle Jalon d&apos;origine
                reste intact.
              </div>
            )}
            {editTarget.blocks.length > 0 ? (
              <TemplateBlocksEditor templateId={editTarget.id} initialBlocks={editTarget.blocks} canEdit />
            ) : (
              <div className="flex flex-col gap-2.5">
                <TemplateEditor templateId={editTarget.id} title={title} bodyText={editTarget.bodyText} />
                <ActivateBlocksButton templateId={editTarget.id} bodyText={editTarget.bodyText} />
              </div>
            )}
          </div>
        )}

        {error && <div className="text-[11.5px] text-rust">{error}</div>}
      </div>
    </div>
  );
}
