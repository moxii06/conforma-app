"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { QUESTION_BY_KEY, SHORT_OPTION_LABELS, type QuestionKey } from "@/lib/documentQuestionnaire";
import { SearchableDossierSelect } from "@/components/SearchableDossierSelect";
import { DossierSearchSelect } from "@/components/DossierSearchSelect";
import { ReporterSurFormationDialog, type ReportFormationPropose } from "@/components/ReporterSurFormationDialog";
import { Button } from "@/components/ui";

type Dossier = { id: string; label: string };
type PendingQuestion = { key: QuestionKey; label: string; hint?: string; options: { value: string; label: string }[] };

/**
 * `dossiers` est fourni quand l'écran connaît DÉJÀ la petite liste qui a du
 * sens à cet endroit — la fiche d'une formation propose ses propres inscrits,
 * et filtrer côté navigateur suffit. Il est omis là où la liste pertinente
 * est celle de tout l'organisme : la bibliothèque de modèles chargeait alors
 * les 8 000 dossiers pour remplir un menu (audit S7, P1 n°6), et bascule
 * maintenant sur une recherche serveur.
 */
export function GenerateDocumentButton({ templateId, dossiers }: { templateId: string; dossiers?: Dossier[] }) {
  const [open, setOpen] = useState(false);
  const [dossierId, setDossierId] = useState(dossiers?.[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; title: string; missingFields: { key: string; label: string; fixHref: string }[] } | null>(null);
  // Variantes que le modèle conditionnel a résolues pour ce document — auto
  // ou saisi, sans distinction (voir le commentaire d'`applied` côté route).
  // Sert à la fois à afficher les badges et à rouvrir le questionnaire.
  const [applied, setApplied] = useState<{ key: string; value: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Set only when the template has conditional blocks and the dossier's own
  // data couldn't resolve every question they reference — see
  // /api/documents/generate's 409 response.
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>({});
  // Ce que la saisie apprend à la fiche formation — proposé une fois le
  // document créé, pas avant : la génération ne doit dépendre d'aucune
  // décision sur la formation.
  const [report, setReport] = useState<{ reports: ReportFormationPropose[]; courseTitle: string; answers: Partial<Record<QuestionKey, string>> } | null>(null);

  async function submit(withAnswers?: Partial<Record<QuestionKey, string>>) {
    if (!dossierId) return;
    const envoyees = withAnswers ?? answers;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, dossierId, answers: envoyees }),
    });
    setLoading(false);
    if (res.status === 409) {
      const body = await res.json().catch(() => ({ unresolved: [] }));
      setPending(body.unresolved ?? []);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la génération.");
      return;
    }
    const doc = await res.json();
    setResult({ id: doc.id, title: doc.title, missingFields: doc.missingFields ?? [] });
    setApplied(doc.applied ?? []);
    setPending(null);
    const reports: ReportFormationPropose[] = doc.reportsFormation ?? [];
    setReport(reports.length > 0 ? { reports, courseTitle: doc.courseTitle ?? "", answers: envoyees } : null);
  }

  function handleGenerate(e: React.MouseEvent) {
    e.preventDefault();
    setPending(null);
    setAnswers({});
    setApplied([]);
    setReport(null);
    submit({});
  }

  function handleAnswerAndContinue(e: React.MouseEvent) {
    e.preventDefault();
    submit(answers);
  }

  // Rouvre le questionnaire à partir de ce que le document généré a résolu,
  // pour créer une version corrigée sans tout ressaisir — le document déjà
  // créé reste tel quel (générer n'écrase jamais, voir /api/documents/generate) ;
  // valider ce formulaire en crée un second, à jour.
  function handleEditAnswers(e: React.MouseEvent) {
    e.preventDefault();
    setAnswers(Object.fromEntries(applied.map((a) => [a.key, a.value])));
    setPending(applied.map((a) => QUESTION_BY_KEY[a.key as QuestionKey]).filter((q): q is PendingQuestion => q != null));
  }

  // Liste pré-calculée et vide : il n'y a personne pour qui générer, le
  // bouton n'a rien à proposer. En recherche serveur, on ne peut pas le
  // savoir sans requête — le bouton reste donc affiché.
  if (dossiers && dossiers.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
      >
        Générer pour un dossier
      </button>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="w-56">
          {dossiers ? (
            <SearchableDossierSelect dossiers={dossiers} value={dossierId} onChange={setDossierId} />
          ) : (
            <DossierSearchSelect value={dossierId} onChange={setDossierId} />
          )}
        </div>
        <button onClick={handleGenerate} disabled={loading || !dossierId} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60 shrink-0">
          {loading ? "…" : "Générer"}
        </button>
      </div>

      {pending && pending.length > 0 && (
        <div className="bg-linen border border-line rounded-md p-2.5 flex flex-col gap-2 max-w-xs">
          <div className="text-[11px] text-slate">Ce modèle varie selon quelques réponses que le dossier ne précise pas encore :</div>
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
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
          <Button
            size="sm"
            className="self-start"
            onClick={handleAnswerAndContinue}
            disabled={loading || pending.some((q) => !answers[q.key])}
          >
            {loading ? "…" : "Générer le document"}
          </Button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-1">
          <div className="text-[11.5px] text-sage">
            Document créé : <a href={`/api/documents/generated/${result.id}`} target="_blank" rel="noreferrer" className="underline">{result.title}</a>
          </div>
          {applied.length > 0 && (
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
          {result.missingFields.length > 0 && (
            <div className="text-[11px] bg-linen rounded-md px-2 py-1.5 flex flex-col gap-1 max-w-xs">
              <div className="text-seal-dark font-medium">
                {result.missingFields.length === 1 ? "Un champ n'a pas pu être rempli automatiquement :" : `${result.missingFields.length} champs n'ont pas pu être remplis automatiquement :`}
              </div>
              <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                {result.missingFields.map((f) => (
                  <a key={f.key} href={f.fixHref} target="_blank" rel="noreferrer" className="text-ink underline decoration-line hover:decoration-ink">
                    {f.label} →
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {error && <div className="text-[11.5px] text-rust">{error}</div>}

      {report && (
        <ReporterSurFormationDialog
          dossierId={dossierId}
          courseTitle={report.courseTitle}
          reports={report.reports}
          answers={report.answers}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}
