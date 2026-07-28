"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonPicker, type LearnerInput } from "@/components/PersonPicker";
import { SuggestedLearners } from "@/components/SuggestedLearners";
import { LEARNER_CATEGORY_LABELS } from "@/lib/bpfCategories";
import { COURSE_TEMPLATES, COURSE_TEMPLATE_SECTORS } from "@/lib/courseTemplates";
import { X, FileUp, LayoutTemplate, Sparkles } from "lucide-react";

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
  const [maxLearners, setMaxLearners] = useState("");
  const [learners, setLearners] = useState<PendingLearner[]>([]);
  const [accessDurationDays, setAccessDurationDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiIntention, setAiIntention] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineChapter[]>([]);

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
    setOutline(Array.isArray(data.chapters) ? data.chapters : []);
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
    setResponsibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        maxLearners: maxLearners ? parseInt(maxLearners, 10) : undefined,
        initialLearners: learners.map((l) => l.input),
        outline: outline.length > 0 ? outline : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft">
        + Créer une formation
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Créer une formation</div>
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2 border border-dashed border-line rounded-md px-2.5 py-2 text-[12px] text-slate hover:border-ink-soft hover:text-ink cursor-pointer">
            <FileUp size={14} className="shrink-0" />
            {importing ? "Analyse du document…" : "Importer un programme existant (PDF) pour préremplir le titre, la description et la durée"}
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
          {importError && <div className="text-[11.5px] text-rust">{importError}</div>}
          {imported && <div className="text-[11.5px] text-sage">Champs préremplis depuis le document — vérifiez-les avant de créer la formation.</div>}

          {!showAiPrompt ? (
            <button
              type="button"
              onClick={() => setShowAiPrompt(true)}
              className="flex items-center gap-2 border border-dashed border-line rounded-md px-2.5 py-2 text-[12px] text-slate hover:border-ink-soft hover:text-ink"
            >
              <Sparkles size={14} className="shrink-0" />
              Générer une ébauche avec l&apos;IA (objectifs + plan de chapitres)
            </button>
          ) : (
            <div className="border border-line rounded-md p-2.5 flex flex-col gap-2">
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
                className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
              />
              {generateError && <div className="text-[11.5px] text-rust">{generateError}</div>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || !title.trim() || !aiIntention.trim()}
                  className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
                >
                  {generating ? "Génération…" : "Générer"}
                </button>
                <button type="button" onClick={() => setShowAiPrompt(false)} className="text-[12px] text-slate hover:text-ink">
                  Annuler
                </button>
                {!title.trim() && <span className="text-[11px] text-slate">Renseignez d&apos;abord le titre ci-dessous.</span>}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 border border-line rounded-md px-2.5 py-2 text-[12px] text-slate hover:border-ink-soft hover:text-ink cursor-pointer">
            <LayoutTemplate size={14} className="shrink-0" />
            <span className="shrink-0">Ou partir d&apos;un modèle</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) applyTemplate(e.target.value);
                e.target.value = "";
              }}
              className="flex-1 min-w-0 bg-transparent outline-none text-ink"
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
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la formation"
            required
            autoFocus
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnel)"
            rows={2}
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
          />
          <textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="Objectifs pédagogiques (optionnel — ce que l'apprenant saura faire à l'issue)"
            rows={2}
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft resize-none"
          />
          {outline.length > 0 && (
            <div className="border border-line rounded-md p-2.5 flex flex-col gap-2">
              <div className="text-[11px] text-slate uppercase tracking-wide">
                Plan de chapitres proposé — créé avec la formation, à compléter ensuite
              </div>
              {outline.map((chapter, ci) => (
                <div key={ci} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12.5px] font-medium text-ink">{chapter.title}</div>
                    <button type="button" onClick={() => removeOutlineChapter(ci)} className="text-slate hover:text-rust">
                      <X size={12} />
                    </button>
                  </div>
                  {chapter.modules.map((moduleTitle, mi) => (
                    <div key={mi} className="flex items-center justify-between gap-2 pl-3 text-[12px] text-slate">
                      <span>· {moduleTitle}</span>
                      <button type="button" onClick={() => removeOutlineModule(ci, mi)} className="text-slate hover:text-rust shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <input
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            type="number"
            min={1}
            placeholder="Durée de la formation (heures)"
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
          />
          <input
            value={maxLearners}
            onChange={(e) => setMaxLearners(e.target.value)}
            type="number"
            min={1}
            placeholder="Nombre de places (vide = illimité)"
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-ink-soft"
          />
          {members.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate uppercase tracking-wide">Responsables / personnes concernées</div>
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
              <div className="text-[11px] text-slate uppercase tracking-wide">Prestataires externes</div>
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
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] text-slate uppercase tracking-wide">Apprenants à inscrire (optionnel)</div>
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
                className="w-20 bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ink-soft"
              />
            </label>
            <SuggestedLearners
              titleQuery={title}
              excludeIds={new Set(learners.map((l) => l.key))}
              onAdd={(contactId, label) => addLearner({ contactId }, label)}
            />
            <PersonPicker onSelect={addLearner} />
          </div>
          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={loading || !title.trim()} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
              {loading ? "…" : "Créer la formation"}
            </button>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </form>
      </div>
    </div>
  );
}
