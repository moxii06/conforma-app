"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonPicker, type LearnerInput } from "@/components/PersonPicker";
import { SuggestedLearners } from "@/components/SuggestedLearners";
import { LEARNER_CATEGORY_LABELS } from "@/lib/bpfCategories";
import { COURSE_TEMPLATES, COURSE_TEMPLATE_SECTORS } from "@/lib/courseTemplates";
import { X, FileUp, LayoutTemplate, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
// Partagés avec la fiche formation et les écrans de session : ce qu'on
// règle en créant doit se retrouver à l'identique partout ailleurs.
import { SwitchRow, SegmentedControl, FORMAT_OPTIONS, RYTHME_OPTIONS } from "@/components/Controls";

const ETAPES = [
  { n: 1, titre: "L'essentiel" },
  { n: 2, titre: "Le programme" },
  { n: 3, titre: "Les règles" },
  { n: 4, titre: "La session" },
] as const;

type Member = { id: string; name: string };
type PendingLearner = { key: string; label: string; input: LearnerInput & { accessDurationDays?: number } };
type OutlineChapter = { title: string; modules: string[] };

// Client feedback: the trigger used to sit inline in the page content and,
// because its flex-col parent defaults to align-items: stretch, rendered as
// a full-width bar — moved to a small button in the page header (via
// PageHeader's `action` slot) that opens this as a modal instead, same
// pattern as SendDocumentDialog/SendProspectDocumentDialog.
export function CreateCourseForm({ members, subcontractors }: { members: Member[]; subcontractors: Member[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<Set<string>>(new Set());
  const [subcontractorIds, setSubcontractorIds] = useState<Set<string>>(new Set());
  const [durationHours, setDurationHours] = useState("");
  // Saisi en euros, envoyé en centimes. La route acceptait déjà priceCents ;
  // c'est le formulaire qui ne l'a jamais envoyé. Sans prix, la convention et
  // le contrat sortent avec un montant vide et le BPF est faux — c'est le
  // champ manquant qui coûtait le plus cher.
  const [priceEuros, setPriceEuros] = useState("");
  const [maxLearners, setMaxLearners] = useState("");
  const [learners, setLearners] = useState<PendingLearner[]>([]);
  const [accessDurationDays, setAccessDurationDays] = useState("");

  // ── L'assistant ──────────────────────────────────────────────────────
  // Quatre étapes, et un principe qui les rend plus simples et non plus
  // lourdes : on peut créer dès la première. Chaque étape a un défaut
  // acceptable, donc « continuer » et « créer maintenant » cohabitent en bas
  // de chacune. Sans cette porte de sortie, rassembler six écrans en un
  // formulaire ne fait que transformer une dispersion en mur.
  const [etape, setEtape] = useState(1);

  // Étape 1 — ce que devient la première session. Ces deux réglages
  // appartiennent à la Session et non à la Course, mais c'est ici qu'on se
  // les demande : « comment se déroule ma formation » précède « quand ».
  const [format, setFormat] = useState<"IN_PERSON" | "REMOTE" | "HYBRID">("IN_PERSON");
  const [rythme, setRythme] = useState<"FIXED_DATE" | "ROLLING">("FIXED_DATE");

  // Étape 2
  const [prerequisites, setPrerequisites] = useState("");

  // Étape 3 — les règles du parcours. Les valeurs initiales SONT les
  // comportements actuels : ouvrir l'assistant sans rien toucher produit
  // exactement la formation qu'on obtenait avant.
  const [sequentialUnlock, setSequentialUnlock] = useState(true);
  const [withdrawalPolicy, setWithdrawalPolicy] = useState<"" | "closed" | "partial">("");
  const [allowVideoSkip, setAllowVideoSkip] = useState(false);
  const [certificateValidityMonths, setCertificateValidityMonths] = useState("");

  // Étape 4 — la première session
  const [trainerId, setTrainerId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [aiIntention, setAiIntention] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineChapter[]>([]);
  const [nouveauModule, setNouveauModule] = useState("");

  async function handleImport(file: File) {
    setImporting(true);
    setImportError(null);
    setImported(false);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/courses/import-analyze", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setImporting(false);
    if (!res.ok) {
      setImportError(data.error ?? "Échec de l'analyse du document.");
      return;
    }
    if (data.title) setTitle(data.title);
    if (data.description) setDescription(data.description);
    if (data.durationHours) setDurationHours(String(data.durationHours));
    setImported(true);
  }

  async function handleGenerate() {
    if (!title.trim() || !aiIntention.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    const res = await fetch("/api/courses/generate-outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, intention: aiIntention }),
    });
    const data = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) {
      setGenerateError(data.error ?? "Échec de la génération.");
      return;
    }
    if (data.description) setDescription(data.description);
    if (data.objectives) setObjectives(data.objectives);
    // On normalise plutôt que de faire confiance : un chapitre rendu sans
    // `modules` casserait le rendu de la liste, et la sortie vient d'un
    // modèle, pas d'un schéma.
    setOutline(
      (Array.isArray(data.chapters) ? data.chapters : []).map((c: Partial<OutlineChapter>) => ({
        title: String(c?.title ?? ""),
        modules: Array.isArray(c?.modules) ? c.modules : [],
      }))
    );
    setShowAiPrompt(false);
    setImported(false);
    setImportError(null);
  }

  function removeOutlineChapter(index: number) {
    setOutline((prev) => prev.filter((_, i) => i !== index));
  }

  function removeOutlineModule(chapterIndex: number, moduleIndex: number) {
    setOutline((prev) =>
      prev.map((c, i) => (i === chapterIndex ? { ...c, modules: c.modules.filter((_, j) => j !== moduleIndex) } : c))
    );
  }

  function renameOutlineChapter(index: number, titre: string) {
    setOutline((prev) => prev.map((c, i) => (i === index ? { ...c, title: titre } : c)));
  }

  function addOutlineChapter() {
    setOutline((prev) => [...prev, { title: `Chapitre ${prev.length + 1}`, modules: [] }]);
  }

  // Le module rejoint le DERNIER chapitre : c'est là qu'on écrit quand on
  // déroule un programme de haut en bas. Sans chapitre, on en crée un — la
  // route crée chaque module sous un chapitre porteur, un module orphelin
  // n'existerait nulle part.
  function addOutlineModule() {
    const titre = nouveauModule.trim();
    if (!titre) return;
    setOutline((prev) =>
      prev.length === 0
        ? [{ title: "Programme", modules: [titre] }]
        : prev.map((c, i) => (i === prev.length - 1 ? { ...c, modules: [...c.modules, titre] } : c))
    );
    setNouveauModule("");
  }

  function addLearner(input: LearnerInput, label: string) {
    const key = "contactId" in input ? input.contactId : input.email;
    if (learners.some((l) => l.key === key)) return;
    const durationInput = accessDurationDays ? { accessDurationDays: parseInt(accessDurationDays, 10) } : {};
    setLearners((prev) => [...prev, { key, label, input: { ...input, ...durationInput } }]);
  }

  function removeLearner(key: string) {
    setLearners((prev) => prev.filter((l) => l.key !== key));
  }

  function toggleResponsible(id: string) {
    const etaitCoche = responsibleIds.has(id);
    setResponsibleIds((prev) => {
      const next = new Set(prev);
      if (etaitCoche) next.delete(id);
      else next.add(id);
      return next;
    });
    // Étape 4 : le formateur de la première session, repris du responsable.
    // Dans un petit organisme c'est la même personne, et le sélecteur
    // restait sur « À désigner plus tard » alors que la réponse venait
    // d'être cochée juste au-dessus. On ne touche à rien dès qu'un
    // formateur a été choisi explicitement, et on relâche si le responsable
    // repris est décoché — laisser un formateur que plus rien ne justifie
    // serait pire que ne rien pré-remplir.
    if (!etaitCoche && trainerId === "") setTrainerId(id);
    if (etaitCoche && trainerId === id) setTrainerId("");
  }

  function toggleSubcontractor(id: string) {
    setSubcontractorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyTemplate(templateId: string) {
    const template = COURSE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setTitle(template.title);
    setDescription(template.description);
    setDurationHours(String(template.durationHours));
    setImported(false);
    setImportError(null);
    setOutline([]);
    setShowTemplatePicker(false);
  }

  function reset() {
    setTitle("");
    setDescription("");
    setObjectives("");
    setResponsibleIds(new Set());
    setSubcontractorIds(new Set());
    setDurationHours("");
    setLearners([]);
    setAccessDurationDays("");
    setError(null);
    setImportError(null);
    setImported(false);
    setShowAiPrompt(false);
    setAiIntention("");
    setGenerateError(null);
    setOutline([]);
    setNouveauModule("");
    setShowTemplatePicker(false);
    setEtape(1);
    setPriceEuros("");
    setMaxLearners("");
    setFormat("IN_PERSON");
    setRythme("FIXED_DATE");
    setPrerequisites("");
    setSequentialUnlock(true);
    setWithdrawalPolicy("");
    setAllowVideoSkip(false);
    setCertificateValidityMonths("");
    setTrainerId("");
    setSessionDate("");
    setStartTime("09:00");
    setEndTime("17:00");
    setLocation("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || undefined,
        objectives: objectives || undefined,
        responsibleUserIds: Array.from(responsibleIds),
        subcontractorIds: Array.from(subcontractorIds),
        durationHours: durationHours ? parseInt(durationHours, 10) : undefined,
        // Arrondi explicite : « 1 400,5 » saisi en euros ne doit pas produire
        // un demi-centime, que la route refuserait sans rien expliquer.
        priceCents: priceEuros ? Math.round(parseFloat(priceEuros.replace(",", ".")) * 100) : undefined,
        maxLearners: maxLearners ? parseInt(maxLearners, 10) : undefined,
        sequentialUnlock,
        // Chaîne vide = « hérite de l'organisme ». On envoie null pour le
        // dire, plutôt que d'omettre le champ : la formation peut avoir eu
        // un avis qu'on repose.
        withdrawalAccessPolicy: withdrawalPolicy === "" ? null : withdrawalPolicy,
        // Les apprenants ne sont PAS envoyés ici : à cet instant la session
        // voulue (étape 4) n'existe pas encore, donc resolveEnrollmentSession
        // leur en créerait une par défaut ("Toujours ouverte", distanciel,
        // brouillon) au lieu de celle qu'on est en train de configurer. Ils
        // sont inscrits plus bas, une fois cette session réellement créée.
        outline: outline.length > 0 ? outline : undefined,
      }),
    });
    if (!res.ok) {
      setLoading(false);
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }
    const course = await res.json().catch(() => null);

    // Deux champs que la route de création ne prend pas — elle n'a jamais eu
    // à les connaître. Un PATCH derrière plutôt que d'élargir son contrat
    // pour deux réglages secondaires. S'il échoue, la formation existe
    // quand même : on ne le signale pas comme un échec de création.
    if (course?.id && (allowVideoSkip || certificateValidityMonths || prerequisites.trim())) {
      await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(allowVideoSkip ? { allowVideoSkip: true } : {}),
          ...(certificateValidityMonths ? { certificateValidityMonths: parseInt(certificateValidityMonths, 10) } : {}),
          ...(prerequisites.trim() ? { prerequisites: prerequisites.trim() } : {}),
        }),
      }).catch(() => {});
    }

    // La première session, quand une date a été posée. Aujourd'hui une
    // session est créée automatiquement et silencieusement à la première
    // inscription : capacité par défaut, aucun formateur, dates arbitraires.
    // Personne ne l'a décidée, et elle apparaît telle quelle dans le
    // planning. La créer ici la rend explicite.
    let sessionEchouee = false;
    let createdSessionId: string | undefined;
    if (course?.id && rythme === "FIXED_DATE" && sessionDate) {
      const r = await fetch("/api/planning/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // La route distingue « rattacher à une formation existante » de
          // « en créer une au passage ». Ici la formation vient d'être
          // créée juste au-dessus : c'est le premier cas.
          courseMode: "existing",
          courseId: course.id,
          trainerId: trainerId || undefined,
          mode: "FIXED_DATE",
          startsAt: `${sessionDate}T${startTime}:00`,
          endsAt: `${sessionDate}T${endTime}:00`,
          format,
          location: location || undefined,
          capacity: maxLearners ? parseInt(maxLearners, 10) : 8,
        }),
      });
      sessionEchouee = !r.ok;
      if (r.ok) {
        const createdSession = await r.json().catch(() => null);
        createdSessionId = createdSession?.id;
      }
    }

    // Les apprenants, une fois la session voulue posée (ou son échec connu).
    // Inscrire avant l'aurait fait atterrir dans la session par défaut que
    // resolveEnrollmentSession crée quand le cours n'en a encore aucune — la
    // session « fantôme » de l'audit. On passe explicitement l'id créé
    // ci-dessus ; sans lui (rythme en continu, ou pas de date renseignée),
    // resolveEnrollmentSession garde son propre comportement par défaut.
    if (course?.id && learners.length > 0) {
      for (const learner of learners) {
        await fetch(`/api/courses/${course.id}/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...learner.input,
            ...(createdSessionId ? { sessionId: createdSessionId } : {}),
          }),
        }).catch(() => {});
      }
    }

    setLoading(false);
    if (sessionEchouee) {
      // La formation est créée : on ne peut pas la « défaire » en affichant
      // une erreur de création. On dit exactement ce qui a marché et ce qui
      // n'a pas marché, et on laisse la fiche ouverte pour rattraper.
      setError("Formation créée, mais la session n'a pas pu l'être — planifiez-la depuis le Planning.");
      router.refresh();
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        + Créer une formation
      </Button>
    );
  }

  const fieldLabelClass = "text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1";
  const fieldClass = "w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-seal placeholder:text-ash";
  const quickStartButtonClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-3 text-[11px] text-center leading-snug transition-colors ${
      active ? "border-seal bg-[#EDDFC6] text-seal-dark" : "border-line text-slate hover:border-ink-soft hover:text-ink hover:bg-linen"
    }`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="text-[15px] font-display text-ink">Créer une formation</div>
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

        {/* Le fil des étapes. Cliquable : on revient en arrière sans perdre
            la saisie, et on saute en avant si on sait déjà où l'on va. */}
        <div className="flex border-b border-line shrink-0 overflow-x-auto">
          {ETAPES.map((e) => (
            <button
              key={e.n}
              type="button"
              onClick={() => setEtape(e.n)}
              className={`flex items-center gap-2 px-3.5 py-2.5 shrink-0 border-b-2 -mb-px transition-colors ${
                etape === e.n ? "border-ink" : "border-transparent"
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-mono font-semibold ${
                  etape === e.n ? "bg-ink text-white" : "border border-line text-slate"
                }`}
              >
                {e.n}
              </span>
              <span className={`text-[12.5px] font-medium ${etape === e.n ? "text-ink" : "text-slate"}`}>{e.titre}</span>
            </button>
          ))}
        </div>

        <form id="create-course-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* ── ÉTAPE 1 — L'essentiel ─────────────────────────────────── */}
          <div className={etape === 1 ? "flex flex-col gap-3" : "hidden"}>
            <div>
              <label className={fieldLabelClass}>Intitulé de la formation</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex. Sécurité incendie et évacuation"
                required
                className={fieldClass}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={fieldLabelClass}>Durée (heures)</label>
                <input value={durationHours} onChange={(e) => setDurationHours(e.target.value)} type="number" min={1} placeholder="ex. 7" className={fieldClass} />
              </div>
              <div>
                <label className={fieldLabelClass}>Prix (€)</label>
                <input value={priceEuros} onChange={(e) => setPriceEuros(e.target.value)} type="number" min={0} step="0.01" placeholder="ex. 1400" className={fieldClass} />
              </div>
              <div>
                <label className={fieldLabelClass}>Places</label>
                <input value={maxLearners} onChange={(e) => setMaxLearners(e.target.value)} type="number" min={1} placeholder="ex. 12" className={fieldClass} />
              </div>
            </div>
            <div className="text-[11px] text-slate -mt-1">
              Le prix est reporté sur la convention et le contrat. Places vides = illimité.
            </div>

            <div>
              <label className={fieldLabelClass}>Comment se déroule-t-elle ?</label>
              <SegmentedControl value={format} onChange={setFormat} options={FORMAT_OPTIONS} label="Format" />
            </div>

            <div>
              <label className={fieldLabelClass}>Rythme</label>
              <SegmentedControl value={rythme} onChange={setRythme} options={RYTHME_OPTIONS} label="Rythme" />
            </div>
          </div>

          {/* ── ÉTAPE 2 — Le programme ────────────────────────────────── */}
          <div className={etape === 2 ? "flex flex-col gap-4" : "hidden"}>
          {/* Démarrage rapide */}
          <div className="flex flex-col gap-2">
            <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">Démarrage rapide (optionnel)</div>
            <div className="grid grid-cols-3 gap-2">
              <label className={`${quickStartButtonClass(importing)} cursor-pointer`}>
                <FileUp size={16} />
                {importing ? "Analyse…" : "Importer un PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" onClick={() => setShowAiPrompt((v) => !v)} className={quickStartButtonClass(showAiPrompt)}>
                <Sparkles size={16} />
                Générer avec l&apos;IA
              </button>
              <button type="button" onClick={() => setShowTemplatePicker((v) => !v)} className={quickStartButtonClass(showTemplatePicker)}>
                <LayoutTemplate size={16} />
                Partir d&apos;un modèle
              </button>
            </div>

            {importError && <div className="text-[11.5px] text-rust">{importError}</div>}
            {imported && <div className="text-[11.5px] text-sage">Champs préremplis depuis le document — vérifiez-les avant de créer la formation.</div>}

            {showAiPrompt && (
              <div className="bg-linen border border-line rounded-md p-3 flex flex-col gap-2">
                <div className="text-[11.5px] text-slate">
                  À partir du titre ci-dessous et de ce que les apprenants doivent en retirer, l&apos;IA propose une description,
                  des objectifs pédagogiques et un plan de chapitres — à vérifier avant de créer la formation, rien n&apos;est
                  généré automatiquement.
                </div>
                <textarea
                  value={aiIntention}
                  onChange={(e) => setAiIntention(e.target.value)}
                  placeholder="Ce que les apprenants doivent savoir / savoir faire à la fin (ex. « gérer un entretien annuel difficile sans le laisser dégénérer »)"
                  rows={2}
                  className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-seal resize-none placeholder:text-ash"
                />
                {generateError && <div className="text-[11.5px] text-rust">{generateError}</div>}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating || !title.trim() || !aiIntention.trim()}
                    size="sm"
                  >
                    {generating ? "Génération…" : "Générer"}
                  </Button>
                  <Button variant="tertiary" size="sm" type="button" onClick={() => setShowAiPrompt(false)}>
                    Annuler
                  </Button>
                  {!title.trim() && <span className="text-[11px] text-slate">Renseignez d&apos;abord l&apos;intitulé, à l&apos;étape 1.</span>}
                </div>
              </div>
            )}

            {showTemplatePicker && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyTemplate(e.target.value);
                }}
                className="bg-linen border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-seal"
              >
                <option value="" disabled>
                  Sélectionner un thème…
                </option>
                {COURSE_TEMPLATE_SECTORS.map((sector) => (
                  <optgroup key={sector} label={sector}>
                    {COURSE_TEMPLATES.filter((t) => t.sector === sector).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>

          <div className="border-t border-line" />

          {/* Informations */}
          <div className="flex flex-col gap-3">
            <div>
              <label className={fieldLabelClass}>Description (optionnel)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Résumé en 2-3 phrases"
                rows={2}
                className={`${fieldClass} resize-none`}
              />
            </div>
            <div>
              <label className={fieldLabelClass}>Objectifs pédagogiques (optionnel)</label>
              <textarea
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                placeholder="Ce que l'apprenant saura faire à l'issue"
                rows={2}
                className={`${fieldClass} resize-none`}
              />
            </div>
            <div>
              <label className={fieldLabelClass}>Prérequis</label>
              <textarea
                value={prerequisites}
                onChange={(e) => setPrerequisites(e.target.value)}
                placeholder="Laisser vide affichera « Sans prérequis » sur la fiche publique"
                rows={2}
                className={`${fieldClass} resize-none`}
              />
              {/* Ce champ est celui dont l'absence a valu au pilote sa
                  non-conformité 2022. Le laisser vide n'est pas une
                  omission tant que la fiche publique l'écrit noir sur
                  blanc — d'où le libellé, qui dit ce que le vide produit. */}
            </div>

            {/* Les modules, saisissables à la main.
                Ce bloc n'apparaissait que si l'IA avait produit un plan :
                sans elle, l'étape « Le programme » ne permettait aucun
                module, alors que c'est ce que son nom promet. La saisie
                manuelle et la sortie de l'IA remplissent maintenant la
                même liste, éditable dans les deux cas. */}
            <div className="border border-line rounded-md p-2.5 flex flex-col gap-2">
              <div className={fieldLabelClass}>Modules</div>
              {outline.length === 0 && (
                <div className="text-[11.5px] text-slate">
                  Aucun module pour l&apos;instant. Ceux que vous ajoutez ici sont créés avec la formation ; le contenu
                  (vidéo, page, quiz) se dépose ensuite dans l&apos;onglet Contenu.
                </div>
              )}
              {outline.map((chapter, ci) => (
                <div key={ci} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <input
                      value={chapter.title}
                      onChange={(e) => renameOutlineChapter(ci, e.target.value)}
                      aria-label={`Titre du chapitre ${ci + 1}`}
                      className="flex-1 min-w-0 bg-linen border border-line rounded-md px-2 py-1 text-[12.5px] font-medium text-ink focus:outline-none focus:border-seal"
                    />
                    <button
                      type="button"
                      onClick={() => removeOutlineChapter(ci)}
                      aria-label={`Retirer le chapitre ${chapter.title}`}
                      className="text-slate hover:text-rust shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {chapter.modules.map((moduleTitle, mi) => (
                    <div key={mi} className="flex items-center justify-between gap-2 pl-3 text-[12px] text-slate">
                      <span>· {moduleTitle}</span>
                      <button
                        type="button"
                        onClick={() => removeOutlineModule(ci, mi)}
                        aria-label={`Retirer le module ${moduleTitle}`}
                        className="text-slate hover:text-rust shrink-0"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  value={nouveauModule}
                  onChange={(e) => setNouveauModule(e.target.value)}
                  // Entrée ajoute le module au lieu de soumettre : dans un
                  // formulaire, la touche Entrée sur un champ texte déclenche
                  // l'envoi — ici elle créerait la formation au milieu de la
                  // saisie du programme.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOutlineModule();
                    }
                  }}
                  placeholder="Titre du module — ex. Se présenter en réunion"
                  aria-label="Titre du nouveau module"
                  className={fieldClass}
                />
                <Button type="button" size="sm" variant="secondary" onClick={addOutlineModule} disabled={!nouveauModule.trim()}>
                  Ajouter
                </Button>
              </div>
              <button
                type="button"
                onClick={addOutlineChapter}
                className="self-start text-[11.5px] text-slate hover:text-ink underline decoration-line hover:decoration-ink"
              >
                + Ajouter un chapitre
              </button>
            </div>

          </div>
          </div>

          {/* ── ÉTAPE 3 — Les règles du parcours ──────────────────────── */}
          <div className={etape === 3 ? "flex flex-col" : "hidden"}>
            <SwitchRow
              checked={sequentialUnlock}
              onChange={() => setSequentialUnlock((v) => !v)}
              titre="Terminer un module pour ouvrir le suivant"
              sous="Décochez pour une bibliothèque de ressources consultable dans le désordre."
              consequence="Décoché, tous les modules s'ouvrent dès que l'accès est donné. Un parcours certifiant, dont l'ordre porte la progression pédagogique, veut l'inverse."
            />
            <SwitchRow
              checked={withdrawalPolicy !== "partial"}
              onChange={() => setWithdrawalPolicy((v) => (v === "partial" ? "closed" : "partial"))}
              titre="Bloquer l'accès pendant le délai de rétractation"
              sous="14 jours après la signature — article L.221-18 du code de la consommation."
              consequence="Ce n'est pas un délai pédagogique : c'est le droit de l'apprenant à se rétracter. Ouvrir un module pendant ce délai, c'est commencer à exécuter le contrat alors qu'il peut encore être remboursé intégralement. Décoché, seuls les modules que vous marquez « disponibles pendant la rétractation » s'ouvrent — livret d'accueil, programme, règlement intérieur."
            />
            <SwitchRow
              checked={allowVideoSkip}
              onChange={() => setAllowVideoSkip((v) => !v)}
              titre="Autoriser « Passer cette vidéo »"
              sous="Désactivé par défaut. Chaque saut reste tracé."
            />
            <div className="flex gap-3 items-start py-3">
              <span className="w-[34px] shrink-0" />
              <div className="min-w-0">
                <label className="text-[13px] font-semibold text-ink block">L&apos;attestation expire</label>
                <span className="text-[12px] text-slate block mt-0.5">
                  Pour les habilitations à renouveler (SST, incendie…). Vide = sans expiration.
                </span>
                <input
                  value={certificateValidityMonths}
                  onChange={(e) => setCertificateValidityMonths(e.target.value)}
                  type="number"
                  min={1}
                  placeholder="ex. 24"
                  className="mt-1.5 w-28 bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-seal placeholder:text-ash"
                />
                <span className="text-[12px] text-slate ml-2">mois</span>
              </div>
            </div>
            {withdrawalPolicy === "" && (
              <div className="text-[11.5px] text-slate border-t border-line pt-3">
                Ces réglages valent pour cette formation seule. Tant que vous n&apos;y touchez pas, la rétractation
                suit le choix fait pour tout l&apos;organisme.
              </div>
            )}
          </div>

          {/* ── ÉTAPE 4 — La première session ─────────────────────────── */}
          <div className={etape === 4 ? "flex flex-col gap-4" : "hidden"}>
            {rythme === "FIXED_DATE" ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={fieldLabelClass}>Date</label>
                    <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Début</label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Fin</label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <label className={fieldLabelClass}>{format === "REMOTE" ? "Lien visio (optionnel)" : "Lieu"}</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={format === "REMOTE" ? "Laisser vide : un lien est généré à la convocation" : "Salle, adresse"} className={fieldClass} />
                </div>
                {members.length > 0 && (
                  <div>
                    <label className={fieldLabelClass}>Formateur</label>
                    <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={fieldClass}>
                      <option value="">À désigner plus tard</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    {trainerId !== "" && responsibleIds.has(trainerId) && (
                      <div className="text-[11px] text-slate mt-1">
                        Repris du responsable de la formation — modifiable.
                      </div>
                    )}
                  </div>
                )}
                <div className="text-[11.5px] text-slate">
                  Sans date, aucune session n&apos;est créée maintenant — la formation existe et vous la planifiez
                  depuis le Planning.
                </div>
              </div>
            ) : (
              <div className="text-[12.5px] text-slate bg-linen border border-line rounded-md p-3">
                Formation en continu : il n&apos;y a pas de date à fixer. Une session « toujours ouverte » est créée
                à la première inscription, et chaque apprenant suit son propre calendrier.
              </div>
            )}

          {(members.length > 0 || subcontractors.length > 0) && (
            <>
              <div className="border-t border-line" />
              <div className="flex flex-col gap-3">
                {members.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">Responsables / personnes concernées</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {members.map((m) => (
                        <label key={m.id} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                          <input type="checkbox" checked={responsibleIds.has(m.id)} onChange={() => toggleResponsible(m.id)} className="accent-sage" />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {subcontractors.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">Prestataires externes</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {subcontractors.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                          <input type="checkbox" checked={subcontractorIds.has(s.id)} onChange={() => toggleSubcontractor(s.id)} className="accent-sage" />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-line" />

          {/* Apprenants */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">Apprenants à inscrire (optionnel)</div>
            {learners.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {learners.map((l) => (
                  <span key={l.key} className="inline-flex items-center gap-1 bg-white border border-line rounded-full pl-2.5 pr-1.5 py-1 text-[11.5px] text-ink">
                    {l.label}
                    {l.input.learnerCategory && (
                      <span className="text-slate">· {LEARNER_CATEGORY_LABELS[l.input.learnerCategory]}</span>
                    )}
                    {l.input.accessDurationDays && <span className="text-slate">· {l.input.accessDurationDays}j</span>}
                    <button type="button" onClick={() => removeLearner(l.key)} className="text-slate hover:text-rust">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-[11.5px] text-slate">
              Durée pour terminer (jours, si formation en continu)
              <input
                type="number"
                min={1}
                value={accessDurationDays}
                onChange={(e) => setAccessDurationDays(e.target.value)}
                placeholder="ex. 90"
                className="w-20 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-seal"
              />
            </label>
            <SuggestedLearners
              titleQuery={title}
              excludeIds={new Set(learners.map((l) => l.key))}
              onAdd={(contactId, label) => addLearner({ contactId }, label)}
            />
            <PersonPicker onSelect={addLearner} />
          </div>
          </div>
        </form>

        {/* Le pied de page qui fait tout l'écart avec un formulaire de 25
            champs : « Créer maintenant » est présent à CHAQUE étape, pas
            seulement à la dernière. On n'est jamais retenu par une
            information qu'on n'a pas encore tranchée. */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-t border-line shrink-0 flex-wrap">
          {etape > 1 && (
            <Button variant="tertiary" size="sm" type="button" onClick={() => setEtape((n) => n - 1)}>
              Retour
            </Button>
          )}
          {etape < 4 && (
            <Button size="sm" type="button" onClick={() => setEtape((n) => n + 1)} disabled={!title.trim()}>
              Continuer
            </Button>
          )}
          <Button
            type="submit"
            form="create-course-form"
            disabled={loading || !title.trim()}
            size="sm"
            variant={etape === 4 ? "primary" : "secondary"}
          >
            {loading
              ? "…"
              : etape === 4 && rythme === "FIXED_DATE" && sessionDate
                ? "Créer la formation et la session"
                : etape === 4
                  ? "Créer la formation"
                  : "Créer maintenant, compléter plus tard"}
          </Button>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </div>
      </div>
    </div>
  );
}
