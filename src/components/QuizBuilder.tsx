"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; text: string; correct: boolean };
type Question = { id: string; type: string; prompt: string; options: unknown; correctAnswerText: string | null };

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Choix unique",
  multiple_choice: "Choix multiple",
  true_false: "Vrai / Faux",
  short_answer: "Réponse courte",
};

function newOptionId() {
  return Math.random().toString(36).slice(2, 10);
}

export function QuizBuilder({
  moduleId,
  quizId,
  minScorePercent,
  maxAttempts,
  questions,
}: {
  moduleId: string;
  quizId: string | null;
  minScorePercent: number;
  maxAttempts: number | null;
  questions: Question[];
}) {
  const router = useRouter();
  const [savingSettings, setSavingSettings] = useState(false);
  const [minScore, setMinScore] = useState(String(minScorePercent));
  const [attempts, setAttempts] = useState(maxAttempts != null ? String(maxAttempts) : "");

  const [addOpen, setAddOpen] = useState(false);
  const [qType, setQType] = useState<"single_choice" | "multiple_choice" | "true_false" | "short_answer">("single_choice");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<Option[]>([{ id: newOptionId(), text: "", correct: true }, { id: newOptionId(), text: "", correct: false }]);
  const [correctAnswerText, setCorrectAnswerText] = useState("");
  const [trueFalseCorrect, setTrueFalseCorrect] = useState<"true" | "false">("true");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveSettings() {
    setSavingSettings(true);
    await fetch(`/api/lms/modules/${moduleId}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minScorePercent: Number(minScore) || 70, maxAttempts: attempts ? Number(attempts) : null }),
    });
    setSavingSettings(false);
    router.refresh();
  }

  function toggleOptionCorrect(id: string, multi: boolean) {
    setOptions((prev) =>
      prev.map((o) => (multi ? (o.id === id ? { ...o, correct: !o.correct } : o) : { ...o, correct: o.id === id }))
    );
  }

  function updateOptionText(id: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!quizId) return;
    setLoading(true);
    setError(null);

    let body: Record<string, unknown>;
    if (qType === "short_answer") {
      body = { type: "short_answer", prompt, correctAnswerText };
    } else if (qType === "true_false") {
      body = {
        type: "true_false",
        prompt,
        options: [
          { id: "true", text: "Vrai", correct: trueFalseCorrect === "true" },
          { id: "false", text: "Faux", correct: trueFalseCorrect === "false" },
        ],
      };
    } else {
      body = { type: qType, prompt, options: options.filter((o) => o.text.trim()) };
    }

    const res = await fetch(`/api/lms/quiz/${quizId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'ajout.");
      return;
    }
    setPrompt("");
    setOptions([{ id: newOptionId(), text: "", correct: true }, { id: newOptionId(), text: "", correct: false }]);
    setCorrectAnswerText("");
    setAddOpen(false);
    router.refresh();
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!quizId) return;
    await fetch(`/api/lms/quiz/${quizId}/questions/${questionId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 bg-[#FAF8F2] border border-line rounded-md p-3.5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Score minimum
          <input type="number" min={1} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink w-16" />
          %
        </label>
        <label className="text-[11.5px] text-slate flex items-center gap-1.5">
          Tentatives max.
          <input type="number" min={1} placeholder="illimité" value={attempts} onChange={(e) => setAttempts(e.target.value)} className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink w-20" />
        </label>
        <button onClick={saveSettings} disabled={savingSettings} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60">
          {savingSettings ? "…" : "Enregistrer"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start justify-between gap-2 text-[12px] text-ink border-t border-line pt-2 first:border-t-0 first:pt-0">
            <div>
              <span className="text-slate mr-1.5">{i + 1}.</span>
              {q.prompt}
              <span className="text-slate ml-1.5">({TYPE_LABELS[q.type]})</span>
            </div>
            <button onClick={() => handleDeleteQuestion(q.id)} className="text-[11px] text-rust shrink-0">Supprimer</button>
          </div>
        ))}
        {questions.length === 0 && <div className="text-[11.5px] text-slate">Aucune question.</div>}
      </div>

      {!quizId ? (
        <div className="text-[11.5px] text-slate">Enregistrez les réglages ci-dessus pour pouvoir ajouter des questions.</div>
      ) : !addOpen ? (
        <button onClick={() => setAddOpen(true)} className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start">
          + Ajouter une question
        </button>
      ) : (
        <form onSubmit={handleAddQuestion} className="flex flex-col gap-2 border-t border-line pt-3">
          <select value={qType} onChange={(e) => setQType(e.target.value as typeof qType)} className="bg-white border border-line rounded-md px-2 py-1.5 text-[12px] text-ink">
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
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
                <div key={o.id} className="flex items-center gap-2">
                  <input
                    type={qType === "single_choice" ? "radio" : "checkbox"}
                    name="correct-option"
                    checked={o.correct}
                    onChange={() => toggleOptionCorrect(o.id, qType === "multiple_choice")}
                    className="accent-sage"
                  />
                  <input
                    value={o.text}
                    onChange={(e) => updateOptionText(o.id, e.target.value)}
                    placeholder="Texte de la réponse"
                    className="bg-white border border-line rounded-md px-2 py-1 text-[12px] text-ink flex-1"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, { id: newOptionId(), text: "", correct: false }])}
                className="text-[11.5px] text-slate hover:text-ink self-start"
              >
                + Ajouter une option
              </button>
            </div>
          )}

          {qType === "true_false" && (
            <div className="flex items-center gap-3">
              <label className="text-[12px] text-ink flex items-center gap-1.5">
                <input type="radio" checked={trueFalseCorrect === "true"} onChange={() => setTrueFalseCorrect("true")} className="accent-sage" />
                Vrai
              </label>
              <label className="text-[12px] text-ink flex items-center gap-1.5">
                <input type="radio" checked={trueFalseCorrect === "false"} onChange={() => setTrueFalseCorrect("false")} className="accent-sage" />
                Faux
              </label>
            </div>
          )}

          {qType === "short_answer" && (
            <input
              value={correctAnswerText}
              onChange={(e) => setCorrectAnswerText(e.target.value)}
              placeholder="Réponse attendue (comparaison exacte, insensible à la casse)"
              required
              className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          )}

          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={loading} className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60">
              {loading ? "…" : "Ajouter"}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="text-[12px] text-slate hover:text-ink">Annuler</button>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
        </form>
      )}
    </div>
  );
}
