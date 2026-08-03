"use client";

import { useMemo, useState } from "react";
import { parseNeedsAssessmentBody, joinNeedsAssessmentAnswers } from "@/lib/needsAssessmentQuestions";
import { Button } from "@/components/ui";

export function NeedsAssessmentForm({ token, templateBody }: { token: string; templateBody: string }) {
  // Un champ par question quand le modèle est structuré. Avant, les quatre
  // questions s'affichaient dans un bloc figé au-dessus d'UNE zone de
  // saisie : sur mobile, il fallait remonter lire l'énoncé après chaque
  // paragraphe, et rien n'empêchait d'en oublier une.
  const { questions } = useMemo(() => parseNeedsAssessmentBody(templateBody), [templateBody]);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [responseText, setResponseText] = useState("");
  // Indicator 4 (and the pilot's own 2022 NC majeure): the needs analysis
  // must take potential handicap situations into account at entry. The
  // details are sensitive data (RGPD art. 9) — they are routed to the
  // confidential accommodation channel server-side, never into the
  // regular response text that all dossier-level staff can read.
  const [adaptationNeeded, setAdaptationNeeded] = useState(false);
  const [adaptationDetails, setAdaptationDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/public/needs-assessment/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Recomposé côté client en un seul texte : le serveur, le stockage
        // et tout ce que l'organisme lit ensuite restent inchangés. Chaque
        // réponse reste précédée de sa question, ce qui rend d'ailleurs le
        // résultat plus lisible qu'avant pour l'OF comme pour l'auditeur.
        responseText: questions.length > 0 ? joinNeedsAssessmentAnswers(questions, answers) : responseText,
        adaptationNeeded,
        adaptationDetails: adaptationNeeded && adaptationDetails ? adaptationDetails : undefined,
      }),
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
        <div className="text-[14px] text-ink font-medium mb-1.5">Merci, votre réponse a bien été envoyée.</div>
        <div className="text-[12.5px] text-slate">L&apos;organisme de formation reviendra vers vous prochainement.</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
      {questions.length > 0 ? (
        questions.map((question, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <label htmlFor={`q-${i}`} className="text-[12.5px] text-ink leading-relaxed">
              <span className="text-slate mr-1.5">{i + 1}.</span>
              {question}
            </label>
            <textarea
              id={`q-${i}`}
              // Une seule question obligatoire — la première. Un recueil
              // des besoins n'est pas un interrogatoire : exiger les quatre
              // ferait abandonner celui qui n'a rien à dire à la troisième.
              required={i === 0}
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
              rows={3}
              className="border border-line rounded-md px-3 py-2.5 text-[13px] text-ink outline-none focus:border-seal leading-relaxed"
            />
          </div>
        ))
      ) : (
        <>
          <label htmlFor="reponse" className="text-[12.5px] text-slate">
            Votre réponse
          </label>
          <textarea
            id="reponse"
            required
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={10}
            placeholder="Décrivez votre situation, vos objectifs et vos contraintes…"
            className="border border-line rounded-md px-3 py-2.5 text-[13px] text-ink outline-none focus:border-seal leading-relaxed"
          />
        </>
      )}

      <div className="border-t border-line pt-3 flex flex-col gap-2">
        <label className="flex items-start gap-2.5 text-[12.5px] text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={adaptationNeeded}
            onChange={(e) => setAdaptationNeeded(e.target.checked)}
            className="mt-0.5 accent-sage"
          />
          <span>
            Je suis en situation de handicap ou j&apos;ai besoin d&apos;un aménagement particulier pour suivre la
            formation.
          </span>
        </label>
        {adaptationNeeded && (
          <div className="flex flex-col gap-1.5 pl-6">
            <textarea
              value={adaptationDetails}
              onChange={(e) => setAdaptationDetails(e.target.value)}
              rows={3}
              placeholder="Décrivez, si vous le souhaitez, votre situation et les aménagements qui vous aideraient…"
              className="border border-line rounded-md px-3 py-2.5 text-[13px] text-ink outline-none focus:border-seal leading-relaxed"
            />
            <div className="text-[11px] text-slate">
              Ces informations sont facultatives et confidentielles : elles ne sont transmises qu&apos;au référent
              handicap de l&apos;organisme, qui vous contactera pour étudier les adaptations possibles.
            </div>
          </div>
        )}
      </div>

      <Button type="submit" size="touch" disabled={loading} className="self-start">
        {loading ? "Envoi…" : "Envoyer ma réponse"}
      </Button>
      {error && <div className="text-[12.5px] text-rust">{error}</div>}
    </form>
  );
}
