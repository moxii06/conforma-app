"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { CONTACT_ONLY_MERGE_TAGS } from "@/lib/mergeTags";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { ResultLink } from "@/components/ResultLink";
import { Button } from "@/components/ui";
import { QUESTION_BY_KEY, SHORT_OPTION_LABELS, type QuestionKey } from "@/lib/documentQuestionnaire";
import { grouperModeles, libelleEntree, type ModeleChoisissable } from "@/lib/templatePicker";
import { DialogShell } from "@/components/DialogShell";

type Template = ModeleChoisissable;
type Mode = "template" | "upload";
type PendingQuestion = { key: QuestionKey; label: string; hint?: string; options: { value: string; label: string }[] };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function defaultMessage(): string {
  return `<p>Bonjour,</p><p>Veuillez trouver ci-joint le document.</p>`;
}

// Subcontractor-level counterpart to SendProspectDocumentDialog — same
// template-vs-upload flow, real PDF/rich message, optional Yousign request.
// One real difference: a subcontractor's templates are often conditional
// (formateur contract, tournage vidéo — several always-asked questions),
// unlike the flat CRM prospect templates, so this also carries a small
// questionnaire step when the preview comes back with unresolved questions.
export function SendSubcontractorDocumentDialog({
  subcontractorId,
  templates,
  signatureHtml,
  eSignatureAvailable = false,
}: {
  subcontractorId: string;
  templates: Template[];
  signatureHtml: string;
  eSignatureAvailable?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("template");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyResetKey, setBodyResetKey] = useState(0);
  const [message, setMessage] = useState(() => defaultMessage());
  const [messageResetKey, setMessageResetKey] = useState(0);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [requiresESignature, setRequiresESignature] = useState(false);
  const [category, setCategory] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message: string; link?: string; emailFailed?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the chosen template has conditional blocks the answers below
  // haven't resolved yet — mirrors GenerateDocumentButton's own flow.
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>({});
  // Variantes que le modèle conditionnel a résolues — auto ou saisi, sans
  // distinction (voir le commentaire d'`applied` côté route). Affichées en
  // badges, et ce qui permet de rouvrir le questionnaire sans tout reprendre.
  const [applied, setApplied] = useState<{ key: string; value: string }[]>([]);

  async function loadPreview(id: string, withAnswers: Partial<Record<QuestionKey, string>>) {
    const query = new URLSearchParams({ templateId: id });
    if (Object.keys(withAnswers).length > 0) query.set("answers", JSON.stringify(withAnswers));
    const res = await fetch(`/api/subcontractors/${subcontractorId}/documents/preview-template?${query}`);
    if (!res.ok) {
      setError("Impossible de charger le modèle.");
      return;
    }
    const data = await res.json();
    if (data.unresolved && data.unresolved.length > 0) {
      setPending(data.unresolved);
      return;
    }
    setPending(null);
    setTitle(data.title);
    setBodyHtml(plainTextToHtml(data.bodyText));
    setBodyResetKey((k) => k + 1);
    setCategory(data.category);
    setApplied(data.applied ?? []);
  }

  async function handlePickTemplate(id: string) {
    setTemplateId(id);
    setError(null);
    setAnswers({});
    setPending(null);
    setApplied([]);
    if (!id) {
      setTitle("");
      setBodyHtml("");
      setBodyResetKey((k) => k + 1);
      return;
    }
    await loadPreview(id, {});
  }

  async function handleAnswerAndContinue() {
    setError(null);
    await loadPreview(templateId, answers);
  }

  // Rouvre le questionnaire à partir de ce que l'aperçu a déjà résolu (auto
  // ou saisi, sans distinction) plutôt que de tout recommencer.
  function handleEditAnswers() {
    setAnswers(Object.fromEntries(applied.map((a) => [a.key, a.value])));
    setPending(applied.map((a) => QUESTION_BY_KEY[a.key as QuestionKey]).filter((q): q is PendingQuestion => q != null));
  }

  function reset() {
    setMode("template");
    setTemplateId("");
    setTitle("");
    setBodyHtml("");
    setBodyResetKey((k) => k + 1);
    setMessage(defaultMessage());
    setMessageResetKey((k) => k + 1);
    setIncludeSignature(true);
    setRequiresESignature(false);
    setCategory("other");
    setFile(null);
    setPending(null);
    setAnswers({});
    setApplied([]);
    setResult(null);
    setError(null);
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
    formData.set("message", includeSignature ? message + signatureHtml : message);
    formData.set("requiresSignature", String(requiresESignature));
    if (mode === "template") {
      formData.set("templateId", templateId);
      formData.set("bodyText", bodyHtml);
    } else if (file) {
      formData.set("file", file);
    }

    const res = await fetch(`/api/subcontractors/${subcontractorId}/documents/send`, { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult({
      message: body.emailSent ? "Document envoyé par email, en pièce jointe." : "Document créé — email non envoyé, lien à transmettre :",
      link: body.documentUrl,
      emailFailed: !body.emailSent,
    });
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
        Envoyer un document
      </button>
    );
  }

  return (
    <DialogShell title={"Envoyer un document"} onClose={() => {
              setOpen(false);
              reset();
            }} maxWidth="max-w-lg">

        {result ? (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-sage">{result.message}</div>
            {result.link && <ResultLink url={result.link} showCopy={result.emailFailed === true} />}
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

            <form onSubmit={handleSendDocument} className="flex flex-col gap-3">
              {mode === "template" && (
                <select
                  value={templateId}
                  onChange={(e) => handlePickTemplate(e.target.value)}
                  required
                  className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                >
                  <option value="">Choisir un modèle…</option>
                  {/* Groupé : une copie adaptée porte le titre de l'original
                      Jalon — voir lib/templatePicker.ts. */}
                  {grouperModeles(templates).map((g) => (
                    <optgroup key={g.cle} label={g.label}>
                      {g.entrees.map((e) => (
                        <option key={e.modele.id} value={e.modele.id}>
                          {libelleEntree(e, CATEGORY_LABELS[e.modele.category] ?? e.modele.category)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}

              {mode === "template" && pending && pending.length > 0 ? (
                <div className="bg-linen border border-line rounded-md p-2.5 flex flex-col gap-2">
                  <div className="text-[11px] text-slate">Ce modèle varie selon quelques réponses :</div>
                  {pending.map((q) => (
                    <div key={q.key} className="flex flex-col gap-1">
                      <label className="text-[11px] text-ink font-medium">{q.label}</label>
                      <select
                        value={answers[q.key] ?? ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                        className="border border-line rounded-md px-2 py-1 text-[11.5px] text-ink outline-none focus:border-seal"
                      >
                        <option value="">Choisir…</option>
                        {q.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAnswerAndContinue}
                    disabled={pending.some((q) => !answers[q.key])}
                    className="self-start"
                  >
                    Valider les réponses
                  </Button>
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

                  {mode === "template" && applied.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleEditAnswers}
                        className="inline-flex items-center gap-1 text-[11px] text-slate hover:text-ink shrink-0"
                      >
                        <ArrowLeft size={11} /> Modifier les réponses
                      </button>
                      {applied.map((a) => (
                        <span
                          key={a.key}
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-sage bg-[#DEE5E0] rounded-md px-1.5 py-0.5"
                        >
                          ✓ {SHORT_OPTION_LABELS[a.key]?.[a.value] ?? a.value}
                        </span>
                      ))}
                    </div>
                  )}

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

                  <div className="flex flex-col gap-0.5">
                    <label className={`flex items-center gap-2 ${eSignatureAvailable ? "cursor-pointer" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        checked={requiresESignature}
                        disabled={!eSignatureAvailable}
                        onChange={(e) => setRequiresESignature(e.target.checked)}
                        className="accent-ink w-3.5 h-3.5"
                      />
                      <span className="text-[12px] text-ink">Demander une signature électronique (Yousign)</span>
                    </label>
                    {!eSignatureAvailable && (
                      <div className="text-[11px] text-slate pl-[22px]">
                        Nécessite une clé API Yousign — à configurer sur la page Intégrations.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] text-slate uppercase tracking-wide">Message accompagnant l&apos;envoi</div>
                    <RichTextEditor html={message} onChange={setMessage} resetKey={messageResetKey} placeholder="Votre message…" mergeTags={CONTACT_ONLY_MERGE_TAGS} />
                    <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2.5">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    sending ||
                    (mode === "template" && !templateId) ||
                    Boolean(pending && pending.length > 0) ||
                    !title.trim() ||
                    (mode === "template" && !stripHtml(bodyHtml)) ||
                    (mode === "upload" && !file)
                  }
                >
                  {sending ? "Envoi…" : "Envoyer"}
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
            </form>
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </>
        )}
    </DialogShell>
  );
}
