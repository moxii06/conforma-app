"use client";

import { useState } from "react";

type Question = { id: string; type: string; prompt: string; options: { id: string; text: string }[] | null };

export function SatisfactionSurveyForm({ token, questions }: { token: string; questions: Question[] }) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function setSingle(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMultiple(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/public/satisfaction/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'envoi.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-white border border-line rounded-card p-6 text-center">
        <div className="text-[14px] text-ink font-medium mb-1.5">Merci pour votre retour !</div>
        <div className="text-[12.5px] text-slate">Votre réponse a bien été enregistrée.</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-5 flex flex-col gap-5">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <label className="text-[13px] text-ink font-medium">{q.prompt}</label>

          {q.type === "rating" && (
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSingle(q.id, String(n))}
                  className={`w-9 h-9 rounded-md border text-[13px] font-medium ${
                    answers[q.id] === String(n) ? "bg-ink text-white border-ink" : "border-line text-ink hover:border-ink-soft"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {q.type === "single_choice" && q.options && (
            <div className="flex flex-col gap-1.5">
              {q.options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-[12.5px] text-ink">
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

          {q.type === "multiple_choice" && q.options && (
            <div className="flex flex-col gap-1.5">
              {q.options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input
                    type="checkbox"
                    checked={Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(o.id)}
                    onChange={() => toggleMultiple(q.id, o.id)}
                    className="accent-sage"
                  />
                  {o.text}
                </label>
              ))}
            </div>
          )}

          {q.type === "text" && (
            <textarea
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setSingle(q.id, e.target.value)}
              rows={3}
              className="border border-line rounded-md px-3 py-2 text-[13px] text-ink outline-none focus:border-seal leading-relaxed"
            />
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="bg-ink text-white text-[13px] font-medium rounded-md py-2.5 hover:bg-ink-soft disabled:opacity-60 self-start px-5"
      >
        {loading ? "Envoi…" : "Envoyer ma réponse"}
      </button>
      {error && <div className="text-[12.5px] text-rust">{error}</div>}
    </form>
  );
}
