"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; text: string };
type Question = { id: string; type: string; prompt: string; options: Option[] | null };
type Result = { scorePercent: number; passed: boolean; correctCount: number; totalQuestions: number };

export function QuizTaker({
  quizId,
  dossierId,
  questions,
  minScorePercent,
  maxAttempts,
  attemptsUsed,
  bestResult,
}: {
  quizId: string;
  dossierId: string;
  questions: Question[];
  minScorePercent: number;
  maxAttempts: number | null;
  attemptsUsed: number;
  bestResult: { scorePercent: number; passed: boolean } | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const attemptsLeft = maxAttempts != null ? maxAttempts - attemptsUsed : null;
  const alreadyPassed = bestResult?.passed ?? false;
  const outOfAttempts = attemptsLeft != null && attemptsLeft <= 0 && !alreadyPassed;

  function setSingle(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function toggleMultiple(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = new Set((prev[questionId] as string[] | undefined) ?? []);
      if (current.has(optionId)) current.delete(optionId);
      else current.add(optionId);
      return { ...prev, [questionId]: Array.from(current) };
    });
  }

  function setText(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/lms/quiz/${quizId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId, answers }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setResult(body);
    router.refresh();
  }

  if (alreadyPassed && !result) {
    return (
      <div className="text-[12.5px] text-sage">
        Quiz réussi ({bestResult?.scorePercent}%).
      </div>
    );
  }

  if (result) {
    return (
      <div className={`text-[12.5px] ${result.passed ? "text-sage" : "text-rust"}`}>
        {result.passed ? "Réussi" : "Non validé"} — {result.scorePercent}% ({result.correctCount}/{result.totalQuestions} bonnes réponses,
        seuil {minScorePercent}%).
        {!result.passed && attemptsLeft != null && attemptsLeft - 1 > 0 && (
          <span className="text-slate"> Il vous reste {attemptsLeft - 1} tentative(s).</span>
        )}
      </div>
    );
  }

  if (outOfAttempts) {
    return <div className="text-[12.5px] text-rust">Nombre maximal de tentatives atteint ({maxAttempts}).</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      {questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <div className="text-[12.5px] text-ink font-medium">{i + 1}. {q.prompt}</div>
          {q.type === "multiple_choice" ? (
            <div className="flex flex-col gap-1">
              {q.options?.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    checked={((answers[q.id] as string[] | undefined) ?? []).includes(o.id)}
                    onChange={() => toggleMultiple(q.id, o.id)}
                    className="accent-sage"
                  />
                  {o.text}
                </label>
              ))}
            </div>
          ) : q.type === "short_answer" ? (
            <input
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setText(q.id, e.target.value)}
              className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft max-w-xs"
            />
          ) : (
            <div className="flex flex-col gap-1">
              {q.options?.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-[12px] text-ink">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === o.id}
                    onChange={() => setSingle(q.id, o.id)}
                    className="accent-sage"
                  />
                  {o.text}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2.5">
        <button
          type="submit"
          disabled={loading || Object.keys(answers).length < questions.length}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {loading ? "…" : "Valider mes réponses"}
        </button>
        {attemptsLeft != null && <span className="text-[11px] text-slate">{attemptsLeft} tentative(s) restante(s)</span>}
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
