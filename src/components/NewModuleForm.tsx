"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; text: string; correct: boolean };

function newOptionId() {
  return Math.random().toString(36).slice(2, 10);
}

function newOptions(): Option[] {
  return [
    { id: newOptionId(), text: "", correct: true },
    { id: newOptionId(), text: "", correct: false },
  ];
}

const LABEL = "text-[10.5px] font-semibold text-slate uppercase tracking-wide";
const FIELD = "bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal";

// Client feedback: creating a quiz module used to be a two-step chore —
// create an empty module, then separately expand it and use QuizBuilder
// just to unlock question-adding (its first "Enregistrer" call only exists
// to create the Quiz settings row). This lets staff author that first
// question inline; it's optional (a bare module with no question is still
// valid, matching the pre-existing flow) and reuses the exact same two API
// calls QuizBuilder itself makes (POST .../quiz then POST .../questions),
// just chained right after module creation instead of on a later visit.
export function NewModuleForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"video" | "document" | "quiz">("video");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First-question authoring, quiz type only.
  const [qPrompt, setQPrompt] = useState("");
  const [qKind, setQKind] = useState<"fermee" | "ouverte">("fermee");
  const [qMultiple, setQMultiple] = useState(false);
  const [qOptions, setQOptions] = useState<Option[]>(newOptions);
  const [qAnswerText, setQAnswerText] = useState("");

  function toggleOptionCorrect(id: string) {
    setQOptions((prev) => prev.map((o) => (qMultiple ? (o.id === id ? { ...o, correct: !o.correct } : o) : { ...o, correct: o.id === id })));
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setFile(null);
    setType("video");
    setQPrompt("");
    setQKind("fermee");
    setQMultiple(false);
    setQOptions(newOptions());
    setQAnswerText("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.set("courseId", courseId);
    form.set("title", title);
    if (description) form.set("description", description);
    form.set("type", type);
    if (file) form.set("file", file);

    const res = await fetch("/api/lms/modules", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(body.error ?? "Erreur lors de la création.");
      return;
    }

    if (type === "quiz" && qPrompt.trim()) {
      const quizRes = await fetch(`/api/lms/modules/${body.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minScorePercent: 70, maxAttempts: null }),
      });
      const quiz = await quizRes.json().catch(() => null);
      if (quizRes.ok && quiz?.id) {
        const questionBody =
          qKind === "ouverte"
            ? { type: "short_answer", prompt: qPrompt, correctAnswerText: qAnswerText }
            : {
                type: qMultiple ? "multiple_choice" : "single_choice",
                prompt: qPrompt,
                options: qOptions.filter((o) => o.text.trim()),
              };
        const qRes = await fetch(`/api/lms/quiz/${quiz.id}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(questionBody),
        });
        if (!qRes.ok) {
          const qBody = await qRes.json().catch(() => ({}));
          setLoading(false);
          setError(`Module créé, mais l'ajout de la question a échoué : ${qBody.error ?? "erreur inconnue"}. Vous pourrez la rajouter depuis le module.`);
          resetForm();
          router.refresh();
          return;
        }
      }
    }

    setLoading(false);
    if (body.uploadError) {
      setError(`Module créé, mais l'envoi du fichier a échoué : ${body.uploadError}`);
    }
    resetForm();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink">
        + Ajouter un module
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-mist border border-line rounded-md p-3.5 max-w-lg">
      <div className="grid grid-cols-[130px_1fr] gap-2.5">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Type de contenu</label>
          <select value={type} onChange={(e) => setType(e.target.value as "video" | "document" | "quiz")} className={FIELD}>
            <option value="video">Vidéo</option>
            <option value="document">Document</option>
            <option value="quiz">Quiz</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Titre du module</label>
          <input autoFocus required placeholder="ex. Introduction" value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={LABEL}>
          Description{" "}
          {type === "video" ? "(affichée sous la vidéo, côté apprenant)" : type === "document" ? "(affichée avec le document)" : "(facultatif)"}
        </label>
        <textarea
          rows={2}
          placeholder="Consignes ou contexte pour l'apprenant…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${FIELD} resize-none`}
        />
      </div>

      {type !== "quiz" && (
        <div className="flex flex-col gap-1">
          <label className={LABEL}>{type === "video" ? "Fichier vidéo" : "Fichier"}</label>
          <input
            type="file"
            accept={type === "video" ? "video/*" : undefined}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[12px] text-ink file:mr-2.5 file:bg-white file:border file:border-line file:rounded-md file:px-2.5 file:py-1.5 file:text-[12px] file:text-ink file:cursor-pointer hover:file:border-ink-soft"
          />
          {type === "video" && (
            <div className="text-[10.5px] text-slate">L&apos;apprenant la regarde directement sur la plateforme, via un lecteur intégré (aucun téléchargement).</div>
          )}
        </div>
      )}

      {type === "quiz" && (
        <div className="flex flex-col gap-2 bg-white border border-line rounded-md p-3">
          <label className={LABEL}>Première question (facultatif — d&apos;autres pourront être ajoutées ensuite)</label>
          <input placeholder="Intitulé de la question" value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} className={FIELD} />

          {qPrompt.trim() && (
            <>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[12px] text-ink">
                  <input type="radio" checked={qKind === "fermee"} onChange={() => setQKind("fermee")} className="accent-sage" />
                  Question fermée (choix de réponses)
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-ink">
                  <input type="radio" checked={qKind === "ouverte"} onChange={() => setQKind("ouverte")} className="accent-sage" />
                  Question ouverte (réponse libre)
                </label>
              </div>

              {qKind === "fermee" ? (
                <>
                  <label className="flex items-center gap-1.5 text-[11.5px] text-slate">
                    <input
                      type="checkbox"
                      checked={qMultiple}
                      onChange={(e) => {
                        setQMultiple(e.target.checked);
                        if (!e.target.checked) {
                          const firstCorrect = qOptions.find((o) => o.correct)?.id ?? qOptions[0]?.id;
                          setQOptions((prev) => prev.map((o) => ({ ...o, correct: o.id === firstCorrect })));
                        }
                      }}
                    />
                    Plusieurs réponses correctes possibles
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {qOptions.map((o) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input
                          type={qMultiple ? "checkbox" : "radio"}
                          name="new-module-correct-option"
                          checked={o.correct}
                          onChange={() => toggleOptionCorrect(o.id)}
                          className="accent-sage shrink-0"
                        />
                        <input
                          value={o.text}
                          onChange={(e) => setQOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                          placeholder="Texte de la réponse"
                          className={`${FIELD} flex-1`}
                        />
                        {qOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setQOptions((prev) => prev.filter((x) => x.id !== o.id))}
                            className="text-[11px] text-slate hover:text-rust shrink-0"
                          >
                            Retirer
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setQOptions((prev) => [...prev, { id: newOptionId(), text: "", correct: false }])}
                      className="text-[11.5px] text-slate hover:text-ink self-start"
                    >
                      + Ajouter une réponse
                    </button>
                  </div>
                </>
              ) : (
                <input
                  value={qAnswerText}
                  onChange={(e) => setQAnswerText(e.target.value)}
                  placeholder="Réponse attendue (comparaison exacte, insensible à la casse)"
                  className={FIELD}
                />
              )}
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2.5 pt-0.5">
        <button type="submit" disabled={loading} className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60">
          {loading ? "Envoi…" : "Ajouter le module"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[11.5px] text-rust">{error}</div>}
    </form>
  );
}
