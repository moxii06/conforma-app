import { describe, expect, it } from "vitest";
import { parseNeedsAssessmentBody, joinNeedsAssessmentAnswers } from "./needsAssessmentQuestions";

// Ce découpage décide de la tête du seul écran que remplit un prospect.
// Se tromper coûte soit un formulaire à une case trompeuse, soit une
// question perdue en route.

const MODELE_JALON =
  "RECUEIL DES BESOINS\n\n" +
  "Merci de compléter les informations suivantes afin que nous puissions adapter au mieux la formation à votre situation.\n\n" +
  "1. Votre situation actuelle et votre expérience en lien avec la thématique de la formation.\n\n" +
  "2. Vos objectifs et attentes vis-à-vis de cette formation.\n\n" +
  "3. Les difficultés ou contraintes particulières dont l'organisme devrait avoir connaissance.\n\n" +
  "4. Toute autre information utile pour personnaliser votre parcours.";

describe("parseNeedsAssessmentBody", () => {
  it("découpe le modèle de démarrage en quatre questions", () => {
    const { intro, questions } = parseNeedsAssessmentBody(MODELE_JALON);
    expect(questions).toHaveLength(4);
    expect(questions[0]).toContain("Votre situation actuelle");
    expect(questions[3]).toContain("Toute autre information");
    expect(intro).toContain("Merci de compléter");
    expect(intro).not.toContain("1.");
  });

  it("accepte « 1) » autant que « 1. »", () => {
    const { questions } = parseNeedsAssessmentBody("Intro\n\n1) Première\n2) Deuxième");
    expect(questions).toEqual(["Première", "Deuxième"]);
  });

  it("rattache une ligne de continuation à sa question, pas à l'intro", () => {
    const { questions } = parseNeedsAssessmentBody(
      "Intro\n\n1. Une question qui\ndéborde sur deux lignes\n\n2. Une autre",
    );
    expect(questions[0]).toBe("Une question qui déborde sur deux lignes");
    expect(questions).toHaveLength(2);
  });

  it("retombe sur le champ unique quand l'organisme a rédigé en prose", () => {
    const prose = "Merci de nous décrire votre situation et vos attentes en quelques lignes.";
    const { intro, questions } = parseNeedsAssessmentBody(prose);
    expect(questions).toEqual([]);
    expect(intro).toBe(prose);
  });

  it("ne fabrique pas un formulaire à une case pour une énumération isolée", () => {
    // « 1. » seul dans un paragraphe n'est pas une structure de questionnaire.
    const { questions } = parseNeedsAssessmentBody("Voici le point principal :\n1. Merci de nous répondre.");
    expect(questions).toEqual([]);
  });
});

describe("joinNeedsAssessmentAnswers", () => {
  it("garde chaque question devant sa réponse", () => {
    const text = joinNeedsAssessmentAnswers(["Vos objectifs ?", "Vos contraintes ?"], ["Monter en compétence", "Aucune"]);
    expect(text).toBe("1. Vos objectifs ?\nMonter en compétence\n\n2. Vos contraintes ?\nAucune");
  });

  it("marque explicitement une question laissée vide", () => {
    // Un blanc silencieux se lit comme un oubli de l'outil ; « (sans
    // réponse) » se lit comme un choix du répondant.
    const text = joinNeedsAssessmentAnswers(["Vos contraintes ?"], ["   "]);
    expect(text).toContain("(sans réponse)");
  });
});
