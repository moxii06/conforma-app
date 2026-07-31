// Découpe le corps d'un recueil des besoins en questions individuelles.
//
// Le formulaire public affichait les quatre questions dans un bloc figé, et
// UNE seule zone de saisie pour y répondre. Sur mobile, il fallait faire
// l'ascenseur entre l'énoncé et le champ pour chaque question — et rien ne
// garantissait qu'on n'en oublie pas une.
//
// Le corps est du texte libre rédigé par l'organisme : on ne peut pas le
// contraindre. Mais les modèles réels le numérotent, parce que c'est
// naturel. Quand cette structure est là, on la suit ; sinon on retombe sur
// une zone unique, ce qui n'est pas pire qu'aujourd'hui.

export type ParsedNeedsAssessment = {
  /** Texte d'introduction avant la première question numérotée. */
  intro: string;
  /** Une entrée par question numérotée, sans son numéro. Vide si non structuré. */
  questions: string[];
};

const NUMBERED_LINE = /^\s*(\d{1,2})[.)]\s+(.+)$/;

export function parseNeedsAssessmentBody(body: string): ParsedNeedsAssessment {
  const lines = body.split("\n");
  const intro: string[] = [];
  const questions: string[] = [];
  let seenFirstQuestion = false;

  for (const line of lines) {
    const match = line.match(NUMBERED_LINE);
    if (match) {
      seenFirstQuestion = true;
      questions.push(match[2].trim());
      continue;
    }
    // Une ligne non numérotée APRÈS une question en fait partie (un énoncé
    // qui déborde sur deux lignes), plutôt que de devenir du bruit.
    if (seenFirstQuestion) {
      const continuation = line.trim();
      if (continuation) questions[questions.length - 1] += ` ${continuation}`;
      continue;
    }
    intro.push(line);
  }

  // Une seule « question » numérotée n'est pas une structure : c'est
  // probablement une énumération dans un paragraphe. On préfère le champ
  // unique plutôt qu'un formulaire à une case trompeuse.
  if (questions.length < 2) return { intro: body.trim(), questions: [] };

  return { intro: intro.join("\n").trim(), questions };
}

/**
 * Recompose les réponses en un texte unique, celui qui est stocké et que
 * l'organisme lira. Chaque réponse reste précédée de sa question : sans ça,
 * une réponse isolée (« oui », « aucune ») serait illisible six mois plus
 * tard, au moment précis où un auditeur la demande.
 */
export function joinNeedsAssessmentAnswers(questions: string[], answers: string[]): string {
  return questions
    .map((question, i) => `${i + 1}. ${question}\n${(answers[i] ?? "").trim() || "(sans réponse)"}`)
    .join("\n\n");
}
