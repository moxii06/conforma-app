"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Paperclip, CheckCircle2 } from "lucide-react";
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CONTACT_ONLY_MERGE_TAGS } from "@/lib/mergeTags";
import { SHORT_OPTION_LABELS, type QuestionKey } from "@/lib/documentQuestionnaire";
import { SignatureCheckbox } from "@/components/SignatureCheckbox";
import { ResultLink } from "@/components/ResultLink";
import { Button } from "@/components/ui";
import { grouperModeles, libelleEntree, type ModeleChoisissable } from "@/lib/templatePicker";

type Template = ModeleChoisissable;
type AttachMode = "none" | "library" | "upload";
type PendingQuestion = { key: QuestionKey; label: string; options: { value: string; label: string }[] };
type Preview = {
  title: string;
  bodyText: string;
  applied: { key: string; value: string }[];
  missingFields: string[];
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// La route « email seul » (send-email) n'accepte que du texte brut — on
// aplatit le HTML du composeur : les fins de paragraphe deviennent des
// sauts de ligne, le reste des balises disparaît.
function htmlToPlain(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Signature is appended at send time (see includeSignature below), not
// baked into the editable message.
function defaultMessage(contactFirstName: string): string {
  return `<p>Bonjour ${contactFirstName},</p><p></p>`;
}

// Audit P1 — restructuré : le message vient EN PREMIER (« Contacter », pas
// « Envoyer un document »), la pièce jointe est un choix en dessous —
// aucune (email simple), un document de la bibliothèque (recherche + liste,
// tenable avec beaucoup de modèles), ou un fichier de l'ordinateur.
// L'éditeur de contenu du document a disparu (« pas pertinent que l'OFP
// crée son document à partir de rien ») : un modèle est assemblé et
// fusionné côté serveur ; un modèle conditionnel (contrat, convention)
// pose d'abord son court questionnaire — décision Q5, la génération
// personnalisée reste le cœur de l'outil, présentée comme un choix de la
// liste. Le recueil des besoins reste un cas spécial : un lien de
// formulaire en ligne, pas une pièce jointe.
export function SendProspectDocumentDialog({
  opportunityId,
  contactId,
  alreadySentNeedsAssessment,
  templates,
  contactFirstName,
  signatureHtml,
  eSignatureAvailable = false,
}: {
  opportunityId: string;
  contactId: string;
  alreadySentNeedsAssessment: boolean;
  templates: Template[];
  contactFirstName: string;
  signatureHtml: string;
  // True when a Yousign key (the org's own, or Jalon's platform account)
  // exists server-side — there's no internal-stub fallback for a prospect
  // (no portal login yet), so without a key the checkbox simply isn't shown.
  eSignatureAvailable?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [attachMode, setAttachMode] = useState<AttachMode>("none");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState(() => defaultMessage(contactFirstName));
  const [messageResetKey, setMessageResetKey] = useState(0);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [requiresESignature, setRequiresESignature] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message: string; link?: string; emailFailed?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const isNeedsAssessment = attachMode === "library" && selectedTemplate?.category === "needs_assessment";
  // Groupés « Mes modèles » / « Modèles Jalon » : une copie adaptée garde le
  // titre de l'original, donc à plat les deux lignes sont indiscernables —
  // voir lib/templatePicker.ts.
  const groupesFiltres = grouperModeles(
    templates.filter((t) => {
      const q = templateSearch.trim().toLowerCase();
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || (CATEGORY_LABELS[t.category] ?? "").toLowerCase().includes(q);
    }),
  );
  const aucunResultat = groupesFiltres.length === 0;

  async function loadPreview(id: string, manualAnswers: Partial<Record<QuestionKey, string>>) {
    setLoadingPreview(true);
    setError(null);
    const query =
      Object.keys(manualAnswers).length > 0 ? `&answers=${encodeURIComponent(JSON.stringify(manualAnswers))}` : "";
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/documents/preview-template?templateId=${id}${query}`);
    setLoadingPreview(false);
    if (!res.ok) {
      setError("Impossible de charger le modèle.");
      return;
    }
    const data = await res.json();
    if (Array.isArray(data.unresolved) && data.unresolved.length > 0) {
      setPendingQuestions(data.unresolved);
      setPreview(null);
      return;
    }
    setPendingQuestions([]);
    setPreview({ title: data.title, bodyText: data.bodyText, applied: data.applied ?? [], missingFields: data.missingFields ?? [] });
    setTitle(data.title);
    setCategory(data.category);
  }

  function handlePickTemplate(id: string) {
    setTemplateId(id);
    setPreview(null);
    setPendingQuestions([]);
    setAnswers({});
    setError(null);
    if (!id) return;
    const template = templates.find((t) => t.id === id);
    if (template?.category === "needs_assessment") return; // lien de formulaire, pas de PDF à prévisualiser
    void loadPreview(id, {});
  }

  function reset() {
    setAttachMode("none");
    setTemplateSearch("");
    setTemplateId("");
    setPreview(null);
    setPendingQuestions([]);
    setAnswers({});
    setSubject("");
    setTitle("");
    setCategory("other");
    setFile(null);
    setMessage(defaultMessage(contactFirstName));
    setMessageResetKey((k) => k + 1);
    setIncludeSignature(true);
    setRequiresESignature(false);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setResult(null);

    if (isNeedsAssessment) {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/send-needs-assessment`, { method: "POST" });
      setSending(false);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Erreur lors de l'envoi.");
        return;
      }
      const body = await res.json();
      setResult({
        message: body.emailSent ? "Recueil envoyé par email." : "Recueil créé — email non envoyé, lien à transmettre :",
        link: body.formUrl,
        emailFailed: !body.emailSent,
      });
      router.refresh();
      return;
    }

    if (attachMode === "none") {
      // Email simple, sans document — la route générique du contact, qui
      // journalise l'échange dans son historique (ClientOutreach).
      const res = await fetch(`/api/crm/contacts/${contactId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: htmlToPlain(message), includeSignature }),
      });
      setSending(false);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Erreur lors de l'envoi.");
        return;
      }
      const body = await res.json();
      setResult({ message: body.emailSent ? "Email envoyé." : "Email non envoyé (Brevo indisponible) — réessayez plus tard." });
      router.refresh();
      return;
    }

    const formData = new FormData();
    formData.set("mode", attachMode === "library" ? "template" : "upload");
    formData.set("title", title);
    formData.set("category", category);
    formData.set("message", includeSignature ? message + signatureHtml : message);
    formData.set("requiresSignature", String(requiresESignature));
    if (attachMode === "library") {
      formData.set("templateId", templateId);
      if (Object.keys(answers).length > 0) formData.set("answers", JSON.stringify(answers));
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
        Contacter
      </button>
    );
  }

  const attachTabClass = (active: boolean) =>
    `text-[12px] font-medium rounded-md px-2.5 py-1.5 border ${active ? "bg-ink text-white border-ink" : "border-line text-slate hover:text-ink"}`;

  const canSubmit =
    !sending &&
    (isNeedsAssessment ||
      (attachMode === "none" && subject.trim().length > 0 && stripHtml(message).length > 0) ||
      (attachMode === "library" && !!templateId && !!preview && title.trim().length > 0) ||
      (attachMode === "upload" && !!file && title.trim().length > 0));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Contacter le prospect</div>
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
            {/* L'adresse de stockage brute (200 caractères illisibles) était
                affichée telle quelle — un lien nommé suffit. Le bouton de
                copie n'apparaît que si l'email n'est pas parti : c'est le
                seul cas où il faut réellement transmettre le lien à la main. */}
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
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* 1. Le message d'abord — c'est un envoi d'email avant tout. */}
            {!isNeedsAssessment && (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] text-slate uppercase tracking-wide">Votre message</div>
                {attachMode === "none" && (
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Objet de l'email"
                    className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal mb-1"
                  />
                )}
                <RichTextEditor html={message} onChange={setMessage} resetKey={messageResetKey} placeholder="Votre message…" mergeTags={CONTACT_ONLY_MERGE_TAGS} />
                <SignatureCheckbox checked={includeSignature} onChange={setIncludeSignature} />
              </div>
            )}

            {/* 2. La pièce jointe — aucune, bibliothèque, ou ordinateur. */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-slate uppercase tracking-wide flex items-center gap-1">
                <Paperclip size={11} /> Pièce jointe
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button type="button" onClick={() => setAttachMode("none")} className={attachTabClass(attachMode === "none")}>
                  Aucune — email simple
                </button>
                <button type="button" onClick={() => setAttachMode("library")} className={attachTabClass(attachMode === "library")}>
                  Document de la bibliothèque
                </button>
                <button type="button" onClick={() => setAttachMode("upload")} className={attachTabClass(attachMode === "upload")}>
                  Fichier de mon ordinateur
                </button>
              </div>

              {attachMode === "library" && (
                <div className="flex flex-col gap-2">
                  {/* Recherche + liste plutôt qu'un <select> : la bibliothèque
                      grossit avec le temps (remarque explicite du client). */}
                  <div className="flex items-center gap-1.5 border border-line rounded-md px-2.5 py-1.5 bg-white">
                    <Search size={13} className="text-slate shrink-0" />
                    <input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Rechercher un modèle…"
                      className="flex-1 text-[12.5px] text-ink focus:outline-none"
                    />
                  </div>
                  <div className="border border-line rounded-md max-h-40 overflow-y-auto">
                    {aucunResultat && <div className="px-2.5 py-2 text-[11.5px] text-slate">Aucun modèle trouvé.</div>}
                    {groupesFiltres.map((g) => (
                      <div key={g.cle}>
                        <div className="px-2.5 py-1 text-[10.5px] uppercase tracking-wide text-slate bg-mist border-b border-line">
                          {g.label}
                        </div>
                        {g.entrees.map((e) => (
                          <button
                            key={e.modele.id}
                            type="button"
                            onClick={() => handlePickTemplate(e.modele.id)}
                            className={`w-full text-left px-2.5 py-1.5 text-[12.5px] border-b border-line last:border-b-0 ${
                              e.modele.id === templateId ? "bg-linen text-ink font-medium" : "text-ink hover:bg-mist"
                            }`}
                          >
                            {libelleEntree(e, CATEGORY_LABELS[e.modele.category] ?? e.modele.category)}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>

                  {isNeedsAssessment && (
                    <div className="text-[12px] text-slate">
                      {alreadySentNeedsAssessment
                        ? "Un recueil a déjà été envoyé — ceci renverra un nouveau lien."
                        : "Envoie un lien vers un formulaire en ligne que le prospect complète lui-même — pas de pièce jointe."}
                    </div>
                  )}

                  {loadingPreview && <div className="text-[11.5px] text-slate">Préparation du document…</div>}

                  {/* Modèle conditionnel : le court questionnaire remplace
                      l'ancien éditeur pleine page. */}
                  {pendingQuestions.length > 0 && (
                    <div className="flex flex-col gap-2 border border-line rounded-md p-2.5 bg-mist">
                      <div className="text-[11.5px] text-ink font-medium">Quelques précisions pour adapter le document :</div>
                      {pendingQuestions.map((q) => (
                        <label key={q.key} className="flex flex-col gap-0.5 text-[12px] text-ink">
                          <span className="text-slate">{q.label}</span>
                          <select
                            value={answers[q.key] ?? ""}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                            className="bg-white border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-seal"
                          >
                            <option value="">Choisir…</option>
                            {q.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        disabled={loadingPreview || pendingQuestions.some((q) => !answers[q.key])}
                        onClick={() => void loadPreview(templateId, answers)}
                        className="self-start"
                      >
                        Valider ces réponses
                      </Button>
                    </div>
                  )}

                  {preview && !isNeedsAssessment && (
                    <div className="flex flex-col gap-1.5">
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Titre du document"
                        className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                      />
                      {preview.applied.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {preview.applied.map((a) => (
                            <span key={a.key} className="inline-flex items-center gap-1 text-[10.5px] text-sage bg-linen rounded px-1.5 py-0.5">
                              <CheckCircle2 size={10} /> {SHORT_OPTION_LABELS[a.key as QuestionKey]?.[a.value] ?? a.value}
                            </span>
                          ))}
                        </div>
                      )}
                      {preview.missingFields.length > 0 && (
                        <div className="text-[11px] text-rust leading-snug">
                          Champs non remplis (le document partira avec des blancs) : {preview.missingFields.join(" · ")}
                        </div>
                      )}
                      <details className="text-[12px] text-ink">
                        <summary className="cursor-pointer text-[11.5px] text-slate hover:text-ink">Aperçu du document (PDF envoyé en pièce jointe)</summary>
                        <div className="mt-1.5 border border-line rounded-md p-2.5 bg-mist max-h-48 overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-relaxed">
                          {preview.bodyText}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}

              {attachMode === "upload" && (
                <div className="flex flex-col gap-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titre du document"
                    className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal"
                  />
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
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12px] text-ink" />
                </div>
              )}
            </div>

            {/* 3. Signature électronique — seulement quand un document part. */}
            {attachMode !== "none" && !isNeedsAssessment && (
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
            )}

            <div className="flex items-center gap-2.5">
              <Button type="submit" size="sm" disabled={!canSubmit}>
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
            {error && <div className="text-[11.5px] text-rust">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
