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
import { estPertinentPourProspect } from "@/lib/documentStage";

type Template = ModeleChoisissable;
type AttachMode = "none" | "library" | "quote" | "upload";

type Devis = {
  id: string;
  reference: string;
  amountCents: number;
  status: string;
  createdAt: string;
  description?: string | null;
};
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
  peutCreerDevis = false,
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
  /**
   * Émettre un devis engage un prix au nom de l'organisme : c'est réservé
   * aux rôles qui ont la Facturation (PERMISSIONS.invoicing). Un commercial
   * ne l'a pas aujourd'hui — il peut joindre un devis existant, pas en
   * créer un. Sans ce drapeau l'écran lui proposait un bouton qui renvoyait
   * 403 : proposer une action qu'on refusera ensuite est pire que ne pas la
   * proposer.
   */
  peutCreerDevis?: boolean;
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
  const [tousLesModeles, setTousLesModeles] = useState(false);
  // Chargés à l'ouverture de l'onglet plutôt que passés en propriété : la
  // liste du CRM affiche des dizaines de prospects, précharger les devis de
  // chacun coûterait à tout le monde ce dont un seul a besoin. Et un devis
  // créé il y a dix secondes est là sans recharger la page.
  const [devisList, setDevisList] = useState<Devis[] | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [devisChoisi, setDevisChoisi] = useState<Devis | null>(null);
  const [editeur, setEditeur] = useState(false);
  const [listeVisible, setListeVisible] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [refDevis, setRefDevis] = useState("");
  const [montantDevis, setMontantDevis] = useState("");
  const [designationDevis, setDesignationDevis] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message: string; link?: string; emailFailed?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const isNeedsAssessment = attachMode === "library" && selectedTemplate?.category === "needs_assessment";
  // Deux réductions successives, de natures différentes.
  //
  // Le MOMENT du parcours d'abord : un bilan final ou une feuille
  // d'émargement supposent quelqu'un d'inscrit, et cet écran écrit à un
  // prospect. Ils sont repliés, jamais retirés — un organisme peut vouloir
  // envoyer n'importe lequel, et « Voir tous les modèles » est à un clic.
  // Une recherche en cours passe outre le repli : chercher, c'est déjà dire
  // qu'on sait ce qu'on veut.
  //
  // Le GROUPEMENT ensuite (« Mes modèles » / « Modèles Jalon »), parce
  // qu'une copie adaptée garde le titre de l'original et qu'à plat les deux
  // lignes sont indiscernables — voir lib/templatePicker.ts.
  const recherche = templateSearch.trim().toLowerCase();
  const pertinents = templates.filter((t) => estPertinentPourProspect(t.category));
  const relegues = templates.length - pertinents.length;
  const base = tousLesModeles || recherche ? templates : pertinents;
  const groupesFiltres = grouperModeles(
    base.filter((t) => {
      if (!recherche) return true;
      return (
        t.title.toLowerCase().includes(recherche) ||
        (CATEGORY_LABELS[t.category] ?? "").toLowerCase().includes(recherche)
      );
    }),
  );
  const aucunResultat = groupesFiltres.length === 0;

  // Retour client : « quand je clique sur Devis, cela doit m'ouvrir
  // l'éditeur ; je remplis, je valide, cela referme avec modifier/supprimer
  // à côté, et je continue mon message. » L'éditeur est donc l'état
  // d'arrivée, pas une liste suivie d'un lien — écrire un devis est le geste
  // attendu ici, en réutiliser un est le cas particulier.
  async function ouvrirDevis() {
    setAttachMode("quote");
    // Sans le droit d'émettre, l'onglet sert à joindre un devis existant :
    // c'est la liste qu'on ouvre, pas l'éditeur.
    if (!quoteId) {
      setEditeur(peutCreerDevis);
      setListeVisible(!peutCreerDevis);
    }
    if (devisList !== null) return;
    const res = await fetch(`/api/crm/contacts/${contactId}/quotes`);
    const body = await res.json().catch(() => ({ quotes: [] }));
    setDevisList(body.quotes ?? []);
  }

  function ouvrirEnModification() {
    if (!devisChoisi) return;
    setRefDevis(devisChoisi.reference);
    setMontantDevis(String(devisChoisi.amountCents / 100));
    setDesignationDevis(devisChoisi.description ?? "");
    setEditeur(true);
  }

  async function supprimerDevis() {
    if (!devisChoisi) return;
    // Un devis déjà parti n'est pas supprimable — la route le refuse aussi,
    // mais l'écran ne doit pas proposer un geste qui va échouer. On se
    // contente alors de le détacher du message.
    if (devisChoisi.status !== "DRAFT") {
      setQuoteId("");
      setDevisChoisi(null);
      setEditeur(true);
      return;
    }
    setCreationEnCours(true);
    const res = await fetch(`/api/facturation/quotes/${devisChoisi.id}`, { method: "DELETE" });
    setCreationEnCours(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Impossible de supprimer le devis.");
      return;
    }
    setDevisList((prev) => (prev ?? []).filter((d) => d.id !== devisChoisi.id));
    setQuoteId("");
    setDevisChoisi(null);
    setTitle("");
    setEditeur(true);
  }

  function choisirDevis(d: Devis) {
    setQuoteId(d.id);
    setDevisChoisi(d);
    setEditeur(false);
    setListeVisible(false);
    // Le titre du document envoyé porte la référence : c'est sous ce nom
    // que le prospect le recevra et que vous le retrouverez.
    setTitle(`Devis ${d.reference}`);
    setCategory("quote");
  }

  // Création sur place : trois champs, la même route que la Facturation.
  //
  // Délibérément court. L'éditeur de lignes détaillées reste dans
  // Facturation : ici on est en train d'écrire un e-mail à un prospect, et
  // demander une grille de prestations au milieu d'un message ferait perdre
  // le fil. Référence, montant et désignation suffisent à émettre un devis
  // recevable ; le détail se complète ensuite depuis Facturation.
  async function creerDevis() {
    const cents = Math.round(Number(montantDevis.replace(",", ".")) * 100);
    if (!refDevis.trim() || !Number.isFinite(cents) || cents <= 0) {
      setError("Référence et montant sont requis.");
      return;
    }
    setCreationEnCours(true);
    setError(null);
    // Le même bouton crée ou corrige, selon qu'un devis est déjà choisi.
    // « Modifier » rouvre cet éditeur pré-rempli : de l'endroit où on est,
    // les deux gestes sont le même — poser le devis qu'on va envoyer.
    const enModification = Boolean(devisChoisi);
    const res = enModification
      ? await fetch(`/api/facturation/quotes/${devisChoisi!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference: refDevis.trim(),
            description: designationDevis.trim() || null,
            amountCents: cents,
          }),
        })
      : await fetch("/api/facturation/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            reference: refDevis.trim(),
            description: designationDevis.trim() || undefined,
            amountCents: cents,
          }),
        });
    const body = await res.json().catch(() => ({}));
    setCreationEnCours(false);
    if (!res.ok) {
      setError(body.error ?? (enModification ? "Impossible de modifier le devis." : "Impossible de créer le devis."));
      return;
    }
    const devis: Devis = {
      id: body.id,
      reference: body.reference,
      amountCents: body.amountCents,
      status: body.status,
      createdAt: body.createdAt,
      description: body.description ?? null,
    };
    setDevisList((prev) =>
      enModification ? (prev ?? []).map((d) => (d.id === devis.id ? devis : d)) : [devis, ...(prev ?? [])],
    );
    choisirDevis(devis);
    setRefDevis("");
    setMontantDevis("");
    setDesignationDevis("");
  }

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
    formData.set("mode", attachMode === "library" ? "template" : attachMode === "quote" ? "quote" : "upload");
    formData.set("title", title);
    formData.set("category", category);
    formData.set("message", includeSignature ? message + signatureHtml : message);
    formData.set("requiresSignature", String(requiresESignature));
    if (attachMode === "library") {
      formData.set("templateId", templateId);
      if (Object.keys(answers).length > 0) formData.set("answers", JSON.stringify(answers));
    } else if (attachMode === "quote") {
      formData.set("quoteId", quoteId);
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
      (attachMode === "quote" && !!quoteId && title.trim().length > 0) ||
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
                <button type="button" onClick={ouvrirDevis} className={attachTabClass(attachMode === "quote")}>
                  Devis
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

                  {/* Le repli se dit, il ne se subit pas : le nombre exact de
                      modèles écartés, et de quoi les rappeler d'un clic. Une
                      liste silencieusement raccourcie se lit comme une liste
                      complète, et l'organisme chercherait un modèle qu'il a. */}
                  {relegues > 0 && !recherche && (
                    <button
                      type="button"
                      onClick={() => setTousLesModeles((v) => !v)}
                      className="self-start text-[11.5px] text-slate underline decoration-line hover:text-ink"
                    >
                      {tousLesModeles
                        ? "N'afficher que les modèles utiles à un prospect"
                        : `Voir tous les modèles (${relegues} de plus, liés au suivi d'un apprenant inscrit)`}
                    </button>
                  )}

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

              {attachMode === "quote" && (
                <div className="flex flex-col gap-2">
                  {/* Un devis posé : l'éditeur s'efface au profit d'une ligne
                      de résumé, pour rendre la place au message. C'est le
                      cheminement demandé — remplir, valider, continuer à
                      écrire — et non une liste qu'il faudrait re-parcourir. */}
                  {!peutCreerDevis && !devisChoisi && (
                    <div className="text-[11.5px] text-slate leading-relaxed">
                      Vous pouvez joindre un devis existant. En créer un relève de la Facturation, à laquelle votre rôle
                      n&apos;a pas accès — demandez-le à un administrateur de l&apos;organisme.
                    </div>
                  )}
                  {!peutCreerDevis && devisList?.length === 0 && (
                    <div className="text-[12px] text-slate">Aucun devis pour ce prospect.</div>
                  )}

                  {devisChoisi && !editeur && (
                    <div className="border border-line rounded-md px-2.5 py-2 bg-white flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] text-ink font-medium min-w-0 truncate">
                        Devis {devisChoisi.reference}
                      </span>
                      <span className="text-[12.5px] text-slate tabular-nums">
                        {(devisChoisi.amountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                      </span>
                      <div className="flex-1" />
                      {/* Relire avant d'engager : c'est le PDF réel qui
                          partira, pas un rendu approchant — la même fonction
                          le fabrique dans les deux cas. En onglet, pour ne
                          pas perdre le message en cours de rédaction. */}
                      <a
                        href={`/api/crm/quotes/${devisChoisi.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[11.5px] text-slate underline decoration-line hover:text-ink"
                      >
                        Voir le devis
                      </a>
                      <button
                        type="button"
                        onClick={ouvrirEnModification}
                        className="shrink-0 text-[11.5px] text-slate underline decoration-line hover:text-ink"
                      >
                        Modifier
                      </button>
                      {/* « Supprimer » sur un brouillon, « Retirer » sur un
                          devis déjà parti : celui-là, le client en détient une
                          copie, l'effacer laisserait une étape sans cause. */}
                      <button
                        type="button"
                        onClick={supprimerDevis}
                        disabled={creationEnCours}
                        className="shrink-0 text-[11.5px] text-slate underline decoration-line hover:text-rust"
                      >
                        {devisChoisi.status === "DRAFT" ? "Supprimer" : "Retirer"}
                      </button>
                    </div>
                  )}

                  {editeur && (
                    <div className="border border-line rounded-md p-2.5 bg-mist flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-slate uppercase tracking-wide">Référence</span>
                          <input
                            value={refDevis}
                            onChange={(e) => setRefDevis(e.target.value)}
                            placeholder="DEV-2026-001"
                            className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-slate uppercase tracking-wide">Montant €</span>
                          <input
                            value={montantDevis}
                            onChange={(e) => setMontantDevis(e.target.value)}
                            inputMode="decimal"
                            placeholder="1500"
                            className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate uppercase tracking-wide">Désignation</span>
                        <input
                          value={designationDevis}
                          onChange={(e) => setDesignationDevis(e.target.value)}
                          placeholder="Intitulé de la prestation, tel qu'il figurera sur le devis"
                          className="border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
                        />
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button type="button" size="sm" onClick={creerDevis} disabled={creationEnCours}>
                          {creationEnCours ? "…" : devisChoisi ? "Enregistrer" : "Valider le devis"}
                        </Button>
                        {devisChoisi && (
                          <button
                            type="button"
                            onClick={() => setEditeur(false)}
                            className="text-[11.5px] text-slate underline decoration-line hover:text-ink"
                          >
                            Annuler
                          </button>
                        )}
                        {!devisChoisi && (devisList?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setListeVisible((v) => !v)}
                            className="text-[11.5px] text-slate underline decoration-line hover:text-ink"
                          >
                            {listeVisible
                              ? "Masquer les devis existants"
                              : `Joindre un devis existant (${devisList?.length})`}
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate leading-relaxed">
                        Le détail ligne par ligne se complète ensuite depuis Facturation — ici on ne demande que ce
                        qu&apos;il faut pour émettre le devis et l&apos;envoyer.
                      </p>
                    </div>
                  )}

                  {listeVisible && devisList && devisList.length > 0 && (
                    <div className="border border-line rounded-md max-h-40 overflow-y-auto">
                      {devisList.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => choisirDevis(d)}
                          className={`w-full text-left px-2.5 py-1.5 text-[12.5px] border-b border-line last:border-b-0 flex items-center gap-2 ${
                            d.id === quoteId ? "bg-linen text-ink font-medium" : "text-ink hover:bg-mist"
                          }`}
                        >
                          <span className="flex-1 min-w-0 truncate">{d.reference}</span>
                          <span className="shrink-0 tabular-nums">
                            {(d.amountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate">
                            {new Date(d.createdAt).toLocaleDateString("fr-FR")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {quoteId && !editeur && (
                    <div className="text-[11.5px] text-slate leading-relaxed">
                      À l&apos;envoi, ce devis passera en « envoyé » et l&apos;affaire avancera à « Devis envoyé » — comme
                      depuis la Facturation.
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
