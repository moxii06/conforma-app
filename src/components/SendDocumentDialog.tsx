"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { MERGE_TAGS } from "@/lib/mergeTags";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { LibraryPanel } from "@/components/LibraryPanel";
import { PaymentScheduleBuilder } from "@/components/PaymentScheduleBuilder";
import type { Instalment } from "@/lib/paymentSchedule";
import type { QuestionKey } from "@/lib/documentQuestionnaire";

type Template = { id: string; title: string; category: string };

/** Everything the schedule builder needs, precomputed server-side by the
 *  dossier page. Optional: callers that can't provide it (no price on the
 *  dossier) simply get no schedule section. */
export type ScheduleContext = {
  priceCents: number;
  startsAt: string; // ISO
  endsAt: string; // ISO
  capAcknowledged: boolean;
};

// The schedule only means something on the documents that stipulate one.
const SCHEDULED_CATEGORIES = new Set(["contrat_formation", "convention"]);
type PendingQuestion = { key: QuestionKey; label: string; hint?: string; options: { value: string; label: string }[] };
type AppliedAnswer = { key: string; value: string };

// Short badge wording for each resolved conditional variant — the
// questionnaire's own option labels are full sentences, too long for a
// "✓ Distanciel" chip above the assembled preview.
const APPLIED_BADGE_LABELS: Record<string, Record<string, string>> = {
  statutApprenant: { individual: "Particulier", company: "Salarié / entreprise" },
  modalite: { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Hybride" },
  subrogation: { oui: "Subrogation financeur", non: "Sans subrogation" },
  resteACharge: { oui: "Reste à charge inclus", non: "Sans reste à charge" },
};

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
  scheduleContext,
}: {
  dossierId: string;
  templates: Template[];
  contactFirstName: string;
  signatureHtml: string;
  scheduleContext?: ScheduleContext;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "upload">("template");
  const [templateId, setTemplateId] = useState("");
  // `templates` is a server prop, so a template created from the library
  // panel is absent from it until the page reloads. Without this the body
  // would fill in while the picker still read "Choisir un modèle…".
  const [panelTemplates, setPanelTemplates] = useState<Template[]>([]);
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
  // Set when the picked template has conditional blocks the dossier's own
  // data couldn't fully resolve — see preview-template's `unresolved`.
  // The editor stays empty until these are answered and re-submitted.
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [pendingAnswers, setPendingAnswers] = useState<Partial<Record<QuestionKey, string>>>({});
  // Variants the conditional template resolved to (empty for flat templates).
  const [applied, setApplied] = useState<AppliedAnswer[]>([]);
  const [schedule, setSchedule] = useState<Instalment[]>([]);
  const [capAcknowledged, setCapAcknowledged] = useState(scheduleContext?.capAcknowledged ?? false);
  const showSchedule = scheduleContext != null && SCHEDULED_CATEGORIES.has(category);

  async function loadPreview(id: string, answers?: Partial<Record<QuestionKey, string>>) {
    setLoadingPreview(true);
    const query = answers && Object.keys(answers).length > 0 ? `&answers=${encodeURIComponent(JSON.stringify(answers))}` : "";
    const res = await fetch(`/api/dossiers/${dossierId}/documents/preview-template?templateId=${id}${query}`);
    setLoadingPreview(false);
    if (!res.ok) {
      setError("Impossible de charger le modèle.");
      return;
    }
    const data = await res.json();
    if (data.unresolved && data.unresolved.length > 0) {
      setPending(data.unresolved);
      setCategory(data.category);
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
    setPending(null);
    setPendingAnswers({});
    setApplied([]);
    if (!id) {
      setTitle("");
      setBodyHtml("");
      setBodyResetKey((k) => k + 1);
      return;
    }
    await loadPreview(id);
  }

  async function handleAnswerAndPreview() {
    await loadPreview(templateId, pendingAnswers);
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
    setPending(null);
    setPendingAnswers({});
    setApplied([]);
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
    if (showSchedule && schedule.length > 0) {
      formData.set("paymentSchedule", JSON.stringify(schedule));
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
        className="border border-line rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink-soft"
      >
        Envoyer un document
      </button>
    );
  }

  // Shared between the two-column "template" layout (Document | Diffusion)
  // and the single-column "upload" layout, so neither duplicates the field.
  const titleInput = (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      placeholder="Titre du document"
      required
      className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
    />
  );

  const messageField = (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-slate uppercase tracking-wide">Message accompagnant l&apos;envoi</div>
      <RichTextEditor html={message} onChange={setMessage} resetKey={messageResetKey} placeholder="Votre message…" mergeTags={MERGE_TAGS} />
      <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
    </div>
  );

  const requiresSignatureField = (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          checked={requiresSignature}
          onChange={(e) => setRequiresSignature(e.target.checked)}
          className="accent-sage"
        />
        Demander une signature électronique pour ce document
      </label>
      {requiresSignature && (
        <div className="text-[11px] text-slate bg-linen rounded-md px-2.5 py-2">
          Après l&apos;envoi : <span className="text-seal-dark font-medium">en attente de signature</span> → <span className="text-sage font-medium">signé</span>. Le lien de signature est inclus dans l&apos;email.
        </div>
      )}
    </div>
  );

  const sendButtons = (
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
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-card border border-line w-full ${
          mode === "template" && !(pending && pending.length > 0) ? "max-w-2xl" : "max-w-lg"
        } max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5`}
      >
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
            {requiresSignature && (
              <div className="border border-line rounded-md p-3 mt-1 flex flex-col gap-2 max-w-xs">
                <div className="text-[11px] text-slate uppercase tracking-wide">Suivi de signature</div>
                <div className="flex items-center">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-sage shrink-0">
                    <span className="w-2 h-2 rounded-full bg-sage" />
                    Envoyé
                  </div>
                  <div className="flex-1 h-px bg-line mx-2.5 min-w-[28px]" />
                  <div className="flex items-center gap-1.5 text-[11.5px] text-slate shrink-0">
                    <span className="w-2 h-2 rounded-full bg-pebble border border-ash" />
                    Signé
                  </div>
                </div>
                <div className="text-[11px] text-slate">
                  Le statut passera automatiquement à « Signé » — visible dans l&apos;onglet Documents du dossier.
                </div>
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
                {/* The dead end this fixes: the list above only offers what
                    already exists, so needing a template that doesn't meant
                    abandoning this dialog for /documents and coming back.
                    Picking from the panel selects it here directly. */}
                <div className="flex items-center gap-1.5 text-[11.5px] text-slate">
                  <span>Le modèle n&apos;existe pas encore ?</span>
                  <LibraryPanel
                    label="Ouvrir la bibliothèque"
                    useLabel="Choisir"
                    onUse={(t) => {
                      setPanelTemplates((prev) =>
                        prev.some((p) => p.id === t.id) ? prev : [...prev, t],
                      );
                      void handlePickTemplate(t.id);
                    }}
                  />
                </div>
              </div>
            )}

            {mode === "template" && pending && pending.length > 0 ? (
              <div className="bg-linen border border-line rounded-md p-3 flex flex-col gap-2.5">
                <div className="text-[11.5px] text-slate">
                  Ce modèle varie selon quelques réponses que le dossier ne précise pas encore :
                </div>
                {pending.map((q) => (
                  <div key={q.key} className="flex flex-col gap-1">
                    <label className="text-[11.5px] text-ink font-medium">{q.label}</label>
                    <select
                      value={pendingAnswers[q.key] ?? ""}
                      onChange={(e) => setPendingAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
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
                  onClick={handleAnswerAndPreview}
                  disabled={loadingPreview || pending.some((q) => !pendingAnswers[q.key])}
                  className="self-start bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
                >
                  {loadingPreview ? "…" : "Continuer"}
                </button>
              </div>
            ) : mode === "template" ? (
              <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-5">
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-slate uppercase tracking-wide">Document</div>
                  {titleInput}
                  {applied.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {applied.map((a) => (
                        <span
                          key={a.key}
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-sage bg-[#DEE5E0] rounded-md px-1.5 py-0.5"
                        >
                          ✓ {APPLIED_BADGE_LABELS[a.key]?.[a.value] ?? a.value}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] text-slate uppercase tracking-wide">Contenu (PDF envoyé en pièce jointe)</div>
                    <RichTextEditor
                      html={bodyHtml}
                      onChange={setBodyHtml}
                      resetKey={bodyResetKey}
                      placeholder={loadingPreview ? "Chargement…" : "Sélectionnez un modèle pour préremplir le texte, puis adaptez-le si besoin."}
                    />
                  </div>
                  {showSchedule && (
                    <div className="border-t border-line pt-3">
                      <PaymentScheduleBuilder
                        priceCents={scheduleContext.priceCents}
                        category={category}
                        startsAt={new Date(scheduleContext.startsAt)}
                        endsAt={new Date(scheduleContext.endsAt)}
                        value={schedule}
                        onChange={setSchedule}
                        capAcknowledged={capAcknowledged}
                        onAcknowledge={async () => {
                          const res = await fetch("/api/organization/payment-cap-ack", { method: "POST" });
                          if (res.ok) setCapAcknowledged(true);
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 md:border-l md:border-line md:pl-5">
                  <div className="text-[11px] text-slate uppercase tracking-wide">Diffusion</div>
                  {messageField}
                  {requiresSignatureField}
                  {sendButtons}
                </div>
              </div>
            ) : (
              <>
                {titleInput}
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
                {messageField}
                {requiresSignatureField}
                {sendButtons}
              </>
            )}
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
