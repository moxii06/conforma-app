"use client";

import { useState } from "react";
import { ArrowRight, ShieldCheck, Check } from "lucide-react";
import { trackEvent } from "@/lib/track";
import { Button } from "@/components/ui";

// ---------------------------------------------------------------------------
// Auto-diagnostic « préparation Qualiopi » — aimant à prospects (lead magnet).
// Honnête et non trompeur : c'est une auto-évaluation INDICATIVE, structurée
// autour des 7 critères du Référentiel National Qualité. Elle ne préjuge pas
// du résultat d'un audit et ne remplace pas un référent qualité. Aucune
// promesse d'obtention/maintien de la certification.
// ---------------------------------------------------------------------------

const CRITERIA: Record<string, string> = {
  c1: "Information du public",
  c2: "Objectifs & analyse du besoin",
  c3: "Adaptation & suivi des apprenants",
  c4: "Moyens & sous-traitance",
  c5: "Compétences des intervenants",
  c6: "Veille & accessibilité",
  c7: "Appréciations & réclamations",
};

type Q = { id: string; crit: keyof typeof CRITERIA; text: string };

const QUESTIONS: Q[] = [
  { id: "q1", crit: "c1", text: "Publiez-vous des informations détaillées et accessibles sur chaque prestation (prérequis, objectifs, durée, tarifs, modalités et délais d'accès) ?" },
  { id: "q2", crit: "c1", text: "Diffusez-vous vos indicateurs de résultats (satisfaction, réussite, obtention de certification le cas échéant) ?" },
  { id: "q3", crit: "c2", text: "Définissez-vous des objectifs pédagogiques précis et mesurables pour chaque formation ?" },
  { id: "q4", crit: "c2", text: "Analysez-vous le besoin du bénéficiaire avant l'entrée en formation (positionnement, recueil des besoins) ?" },
  { id: "q5", crit: "c3", text: "Adaptez-vous les contenus et suivez-vous l'assiduité et l'atteinte des objectifs (émargements, évaluations) ?" },
  { id: "q6", crit: "c4", text: "Vos moyens pédagogiques, techniques et d'encadrement sont-ils formalisés et adaptés à chaque prestation ?" },
  { id: "q7", crit: "c4", text: "Encadrez-vous vos formateurs externes / sous-traitants (contrat, cahier des charges, périmètre) ?" },
  { id: "q8", crit: "c5", text: "Suivez-vous la qualification et la montée en compétences de vos intervenants (CV, actions de développement) ?" },
  { id: "q9", crit: "c6", text: "Réalisez-vous une veille sur les évolutions légales, réglementaires et métiers de votre champ d'intervention ?" },
  { id: "q10", crit: "c6", text: "Prenez-vous en compte l'accessibilité et les situations de handicap (référent identifié, adaptations possibles) ?" },
  { id: "q11", crit: "c7", text: "Recueillez-vous systématiquement les appréciations des parties prenantes (apprenants, financeurs, formateurs) ?" },
  { id: "q12", crit: "c7", text: "Traitez-vous et tracez-vous les réclamations et non-conformités (registre, actions correctives) ?" },
];

const CHOICES = [
  { value: 2, label: "Oui" },
  { value: 1, label: "En partie" },
  { value: 0, label: "Non" },
] as const;

type Answers = Record<string, number>;

function computeGlobal(answers: Answers): number {
  const ids = Object.keys(answers);
  if (ids.length === 0) return 0;
  const sum = ids.reduce((s, id) => s + answers[id], 0);
  return Math.round((sum / (ids.length * 2)) * 100);
}

function computePerCriterion(answers: Answers): { crit: string; label: string; pct: number }[] {
  return Object.keys(CRITERIA).map((crit) => {
    const qs = QUESTIONS.filter((q) => q.crit === crit && answers[q.id] !== undefined);
    const pct = qs.length ? Math.round((qs.reduce((s, q) => s + answers[q.id], 0) / (qs.length * 2)) * 100) : 0;
    return { crit, label: CRITERIA[crit], pct };
  });
}

function tier(score: number): { title: string; text: string; color: string } {
  if (score >= 80) return { title: "Bien préparé", text: "Votre organisation couvre l'essentiel des attendus. Objectif : sécuriser la traçabilité de vos preuves.", color: "text-sage" };
  if (score >= 50) return { title: "En bonne voie", text: "Des bases solides, mais des points à renforcer avant votre prochain audit.", color: "text-seal-dark" };
  return { title: "Chantiers prioritaires", text: "Plusieurs attendus sont à structurer. Mieux vaut s'y prendre en amont de l'audit.", color: "text-rust" };
}

export function DiagnosticQualiopi() {
  const [step, setStep] = useState<"quiz" | "gate" | "results">("quiz");
  const [answers, setAnswers] = useState<Answers>({});
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === QUESTIONS.length;
  const score = computeGlobal(answers);

  function setAnswer(id: string, value: number) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/diagnostic-qualiopi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, score }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Une erreur est survenue.");
        setLoading(false);
        return;
      }
      // Événement de conversion (no-op si mesure non chargée / non consentie).
      trackEvent("generate_lead", { form: "diagnostic_qualiopi", value: score });
      setStep("results");
    } catch {
      setError("Une erreur réseau est survenue.");
    }
    setLoading(false);
  }

  // ---- Écran 3 : résultats détaillés ----
  if (step === "results") {
    const perCrit = computePerCriterion(answers);
    const weakest = [...perCrit].sort((a, b) => a.pct - b.pct).slice(0, 3);
    const t = tier(score);
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-white border border-line rounded-card p-6 text-center">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Votre score de préparation</div>
          <div className="font-display text-[52px] leading-none text-ink mb-1">{score}%</div>
          <div className={`text-[15px] font-semibold ${t.color} mb-1`}>{t.title}</div>
          <div className="text-[13px] text-slate max-w-md mx-auto">{t.text}</div>
        </div>

        <div className="bg-white border border-line rounded-card p-6">
          <div className="text-[13.5px] font-semibold text-ink mb-4">Votre bilan par critère</div>
          <div className="flex flex-col gap-3">
            {perCrit.map((c) => (
              <div key={c.crit}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="text-ink">{c.label}</span>
                  <span className="text-slate tabular-nums">{c.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-pebble overflow-hidden">
                  <div className={`h-full rounded-full ${c.pct >= 80 ? "bg-sage" : c.pct >= 50 ? "bg-seal" : "bg-rust"}`} style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-6">
          <div className="text-[13.5px] font-semibold text-ink mb-3">Vos 3 points à renforcer en priorité</div>
          <ul className="flex flex-col gap-2">
            {weakest.map((c) => (
              <li key={c.crit} className="flex items-start gap-2 text-[13px] text-ink">
                <span className="text-rust mt-0.5">•</span>
                <span><strong>{c.label}</strong> — {c.pct}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-ink text-white rounded-card p-6 text-center">
          <h3 className="font-display text-[20px] mb-2">Ne reconstituez plus vos preuves la veille de l'audit</h3>
          <p className="text-[13px] text-white/70 max-w-lg mx-auto mb-5">
            Jalon centralise vos preuves Qualiopi au fil de votre activité : chaque session, dossier et évaluation
            se rattache au bon critère. Vous préparez votre audit en continu, pas dans l'urgence.
          </p>
          <Button href="/essai?plan=team" variant="accent" size="touch">
            Essayer Jalon gratuitement <ArrowRight size={15} />
          </Button>
          <div className="text-[11.5px] text-white/50 mt-3">14 jours d'essai, sans carte bancaire.</div>
        </div>

        <p className="text-[11.5px] text-slate leading-relaxed text-center max-w-xl mx-auto">
          Auto-diagnostic indicatif, structuré autour des 7 critères du Référentiel National Qualité. Il ne préjuge
          pas du résultat d'un audit de certification et ne remplace pas l'accompagnement d'un référent qualité.
        </p>
      </div>
    );
  }

  // ---- Écran 2 : capture (score global visible, détail débloqué par email) ----
  if (step === "gate") {
    const t = tier(score);
    return (
      <div className="flex flex-col gap-6 max-w-xl mx-auto">
        <div className="bg-white border border-line rounded-card p-6 text-center">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Votre score global</div>
          <div className="font-display text-[52px] leading-none text-ink mb-1">{score}%</div>
          <div className={`text-[15px] font-semibold ${t.color}`}>{t.title}</div>
        </div>
        <form onSubmit={submitEmail} className="bg-white border border-line rounded-card p-6 flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Affichez votre bilan détaillé</div>
          <div className="text-[12.5px] text-slate">
            Entrez votre email professionnel pour afficher votre score par critère et vos 3 points prioritaires.
          </div>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@votre-organisme.fr"
            className="w-full border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-seal"
          />
          {error && <div className="text-[12.5px] text-rust">{error}</div>}
          <Button type="submit" disabled={loading}>
            {loading ? "…" : "Afficher mon bilan détaillé"}
          </Button>
          <div className="text-[11px] text-slate text-center">Pas de spam. Vous pouvez vous désinscrire à tout moment.</div>
        </form>
      </div>
    );
  }

  // ---- Écran 1 : questionnaire ----
  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-16 z-10 bg-paper/95 backdrop-blur py-3 -mx-2 px-2 border-b border-line">
        <div className="flex items-center justify-between text-[12.5px] mb-1.5">
          <span className="text-slate">{answeredCount} / {QUESTIONS.length} réponses</span>
          <span className="text-seal-dark font-medium">7 critères Qualiopi</span>
        </div>
        <div className="h-1.5 rounded-full bg-pebble overflow-hidden">
          <div className="h-full bg-seal rounded-full transition-all" style={{ width: `${(answeredCount / QUESTIONS.length) * 100}%` }} />
        </div>
      </div>

      {QUESTIONS.map((q, i) => (
        <div key={q.id} className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-seal-dark">{i + 1}.</span>
            <span className="text-[11px] text-slate uppercase tracking-wide">{CRITERIA[q.crit]}</span>
          </div>
          <div className="text-[13.5px] text-ink mb-3.5 leading-snug">{q.text}</div>
          <div className="flex gap-2">
            {CHOICES.map((c) => {
              const active = answers[q.id] === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setAnswer(q.id, c.value)}
                  className={`flex-1 text-[12.5px] font-medium rounded-md px-3 py-2 border transition-colors ${
                    active ? "bg-ink text-white border-ink" : "bg-white text-ink border-line hover:border-ink-soft"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Button type="button" disabled={!allAnswered} onClick={() => setStep("gate")} size="touch">
        {allAnswered ? <>Voir mon score <ArrowRight size={15} /></> : `Répondez aux ${QUESTIONS.length - answeredCount} questions restantes`}
      </Button>
    </div>
  );
}
