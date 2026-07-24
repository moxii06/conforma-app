"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QUESTION_TYPE_LABELS, SURVEY_KIND_LABELS, defaultQuestions, type SurveyKind } from "@/lib/satisfactionSurveys";

type Option = { id: string; text: string };
type Question = { id: string; type: string; prompt: string; options: Option[] | null };

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function SatisfactionSurveyEditor({
  courseId,
  kind,
  initialQuestions,
}: {
  courseId: string;
  kind: SurveyKind;
  initialQuestions: Question[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [qType, setQType] = useState<"rating" | "single_choice" | "multiple_choice" | "text">("rating");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<Option[]>([{ id: newId(), text: "" }, { id: newId(), text: "" }]);

  function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const q: Question = {
      id: newId(),
      type: qType,
      prompt: prompt.trim(),
      options: qType === "single_choice" || qType === "multiple_choice" ? options.filter((o) => o.text.trim()) : null,
    };
    setQuestions((prev) => [...prev, q]);
    setPrompt("");
    setOptions([{ id: newId(), text: "" }, { id: newId(), text: "" }]);
    setAddOpen(false);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function insertDefaults() {
    setQuestions(defaultQuestions(kind).map((q) => ({ id: newId(), type: q.type, prompt: q.prompt, options: q.options ?? null })));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/courses/${courseId}/satisfaction-surveys/${kind}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          options: q.options ?? undefined,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 bg-[#EFEDE7] border border-line rounded-md p-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-semibold text-ink">{SURVEY_KIND_LABELS[kind]}</div>
        {questions.length === 0 && (
          <button type="button" onClick={insertDefaults} className="text-[11.5px] text-slate hover:text-ink underline decoration-line">
            Insérer des questions par défaut
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start justify-between gap-2 text-[12px] text-ink border-t border-line pt-2 first:border-t-0 first:pt-0">
            <div>
              <span className="text-slate mr-1.5">{i + 1}.</span>
              {q.prompt}
              <span className="text-slate ml-1.5">({QUESTION_TYPE_LABELS[q.type]})</span>
            </div>
            <button type="button" onClick={() => removeQuestion(q.id)} className="text-[11px] text-rust shrink-0">
              Supprimer
            </button>
          </div>
        ))}
        {questions.length === 0 && <div className="text-[11.5px] text-slate">Aucune question — le questionnaire ne sera pas envoyé tant qu'il est vide.</div>}
      </div>

      {!addOpen ? (
        <button type="button" onClick={() => setAddOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
          + Ajouter une question
        </button>
      ) : (
        <form onSubmit={addQuestion} className="flex flex-col gap-2 border-t border-line pt-3">
          <select value={qType} onChange={(e) => setQType(e.target.value as typeof qType)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
            {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Question"
            required
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          />

          {(qType === "single_choice" || qType === "multiple_choice") && (
            <div className="flex flex-col gap-1.5">
              {options.map((o) => (
                <input
                  key={o.id}
                  value={o.text}
                  onChange={(e) => setOptions((prev) => prev.map((opt) => (opt.id === o.id ? { ...opt, text: e.target.value } : opt)))}
                  placeholder="Texte de la réponse"
                  className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink"
                />
              ))}
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, { id: newId(), text: "" }])}
                className="text-[11.5px] text-slate hover:text-ink self-start"
              >
                + Ajouter une option
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button type="submit" className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft">
              Ajouter
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="text-[12px] text-slate hover:text-ink">
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2.5 border-t border-line pt-3">
        <button type="button" onClick={save} disabled={saving} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {saving ? "…" : "Enregistrer le questionnaire"}
        </button>
        {error && <span className="text-[11px] text-rust">{error}</span>}
      </div>
    </div>
  );
}
