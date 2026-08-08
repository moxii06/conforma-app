// Le questionnaire de compétence remis à l'intervenant au moment où on
// l'invite (Qualiopi, indicateur 21 : « détermination et mobilisation des
// compétences des intervenants internes et/ou externes »).
//
// POURQUOI PAS IntervenantEvaluation, qui existe pourtant.
//
// Ce modèle porte l'évaluation PÉRIODIQUE que l'organisme conduit sur son
// intervenant, et c'est lui que lisent l'onglet Évaluations et la tâche
// « évaluation annuelle à réaliser » de dashboardTasks.ts : une ligne de
// moins de douze mois éteint l'alerte. Y ranger une auto-déclaration
// remplie par l'intervenant lui-même le jour de son arrivée aurait donc
// éteint, pour un an, le rappel de l'évaluation que l'organisme doit mener
// — un faux négatif sur une exigence Qualiopi, et le genre de défaut que
// personne ne remarque puisqu'il se manifeste par l'ABSENCE d'une ligne.
//
// Les réponses sont donc classées comme ce qu'elles sont : une pièce au
// dossier de l'intervenant. Un Document porté par le sous-traitant, dans
// une catégorie qui lui est propre, avec le texte dans `bodyText` — le
// mécanisme déjà utilisé par tout document rédigé dans l'application. Ce
// choix a un bénéfice qui n'était pas cherché : la pièce devient une ligne
// de la checklist des documents attendus, donc l'organisme voit d'un coup
// d'œil qui a répondu et qui n'a pas répondu.

import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const QUESTIONNAIRE_CATEGORIE = "competence_questionnaire";
export const QUESTIONNAIRE_TITRE = "Questionnaire de compétence à l'entrée";

export type QuestionCompetence = { cle: string; libelle: string; aide: string };

export const QUESTIONS_COMPETENCE: QuestionCompetence[] = [
  {
    cle: "themes",
    libelle: "Votre connaissance des thèmes de la formation",
    aide: "Sur quels sujets intervenez-vous ? Depuis combien de temps, et dans quels contextes ?",
  },
  {
    cle: "organisme",
    libelle: "Votre connaissance de l'organisme et de ses publics",
    aide: "Que savez-vous de notre activité, de nos apprenants et de nos engagements qualité ?",
  },
  {
    cle: "pedagogie",
    libelle: "Votre expérience pédagogique",
    aide: "Formats animés (présentiel, distanciel, atelier), publics accompagnés, nombre d'années d'animation.",
  },
];

export type ReponsesCompetence = Record<string, string>;

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Le corps du document, en HTML simple.
 *
 * HTML et non texte brut parce que c'est ce que la lecture d'un document
 * rédigé attend (/api/documents/generated/[id] passe `bodyText` au
 * générateur de PDF). Les sauts de ligne saisis par l'intervenant sont
 * conservés en <br> : une réponse en trois puces ne doit pas revenir en un
 * seul pavé.
 */
export function formaterQuestionnaire(params: {
  nomIntervenant: string;
  reponses: ReponsesCompetence;
  repondu: boolean;
  date: Date;
}): string {
  const entete = params.repondu
    ? `<p><strong>${echapper(QUESTIONNAIRE_TITRE)}</strong><br />Renseigné par ${echapper(params.nomIntervenant)} le ${format(params.date, "d MMMM yyyy", { locale: fr })}.<br /><em>Déclaration de l'intervenant — à confronter aux justificatifs de qualification versés au dossier.</em></p>`
    : `<p><strong>${echapper(QUESTIONNAIRE_TITRE)}</strong><br />Adressé à ${echapper(params.nomIntervenant)} le ${format(params.date, "d MMMM yyyy", { locale: fr })}. En attente de réponse.</p>`;

  const corps = QUESTIONS_COMPETENCE.map((q) => {
    const reponse = (params.reponses[q.cle] ?? "").trim();
    const texte = reponse
      ? echapper(reponse).replace(/\r?\n/g, "<br />")
      : "<em>Sans réponse.</em>";
    return `<p><strong>${echapper(q.libelle)}</strong><br />${texte}</p>`;
  }).join("");

  return entete + corps;
}

/** Les questions telles qu'elles partent dans l'email d'invitation. */
export function questionnaireEnTexte(): string {
  return QUESTIONS_COMPETENCE.map((q, i) => `${i + 1}. ${q.libelle} — ${q.aide}`).join("\n");
}
