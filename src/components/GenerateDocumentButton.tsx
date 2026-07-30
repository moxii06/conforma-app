"use client";

import { useState } from "react";
import type { QuestionKey } from "@/lib/documentQuestionnaire";
import { SearchableDossierSelect } from "@/components/SearchableDossierSelect";

type Dossier = { id: string; label: string };
type PendingQuestion = { key: QuestionKey; label: string; hint?: string; options: { value: string; label: string }[] };

export function GenerateDocumentButton({ templateId, dossiers }: { templateId: string; dossiers: Dossier[] }) {
  const [open, setOpen] = useState(false);
  const [dossierId, setDossierId] = useState(dossiers[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; title: string; missingFields: { key: string; label: string; fixHref: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set only when the template has conditional blocks and the dossier's own
  // data couldn't resolve every question they reference — see
  // /api/documents/generate's 409 response.
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>({});

  async function submit(withAnswers?: Partial<Record<QuestionKey, string>>) {
    if (!dossierId) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, dossierId, answers: withAnswers ?? answers }),
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
    setPending(null);
  }

  function handleGenerate(e: React.MouseEvent) {
    e.preventDefault();
    setPending(null);
    setAnswers({});
    submit({});
  }

  function handleAnswerAndContinue(e: React.MouseEvent) {
    e.preventDefault();
    submit(answers);
  }

  if (dossiers.length === 0) return null;

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
          <SearchableDossierSelect dossiers={dossiers} value={dossierId} onChange={setDossierId} />
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
          <button
            onClick={handleAnswerAndContinue}
            disabled={loading || pending.some((q) => !answers[q.key])}
            className="self-start bg-ink text-white text-[11.5px] font-medium rounded-md px-2.5 py-1 hover:bg-ink-soft disabled:opacity-60"
          >
            {loading ? "…" : "Générer le document"}
          </button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-1">
          <div className="text-[11.5px] text-sage">
            Document créé : <a href={`/api/documents/generated/${result.id}`} target="_blank" rel="noreferrer" className="underline">{result.title}</a>
          </div>
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
    </div>
  );
}
