import { describe, expect, it } from "vitest";
import { planSend, invalidRecipients, type Recipient } from "./documentBatch";

// Cette fonction décide de deux choses qui se voient immédiatement chez le
// client : combien de PDF partent, et à quel nom chacun est établi. Se
// tromper produit soit huit exemplaires d'un règlement intérieur, soit un
// contrat unique censé engager huit personnes.

const dest = (n: number): Recipient => ({
  dossierId: `d${n}`,
  contactId: `c${n}`,
  name: `Apprenant ${n}`,
  email: `a${n}@exemple.fr`,
});

describe("planSend — document par apprenant", () => {
  it("produit un exemplaire par destinataire", () => {
    const plan = planSend("contrat_formation", [dest(1), dest(2), dest(3)], "lot-x");
    expect(plan.scope).toBe("per_learner");
    expect(plan.documents).toHaveLength(3);
  });

  it("établit chaque exemplaire au nom de son destinataire", () => {
    const plan = planSend("contrat_formation", [dest(1), dest(2)], "lot-x");
    expect(plan.documents[0].titleSuffix).toBe(" — Apprenant 1");
    expect(plan.documents[1].titleSuffix).toBe(" — Apprenant 2");
    // Chacun ne part qu'à sa propre personne : un contrat n'est pas une
    // circulaire, et l'envoyer en copie aux sept autres exposerait les
    // coordonnées de tout le monde.
    expect(plan.documents[0].to).toEqual([dest(1)]);
  });

  it("regroupe les exemplaires sous un batchId commun", () => {
    const plan = planSend("contrat_formation", [dest(1), dest(2), dest(3)], "lot-x");
    expect(plan.batchId).toBe("lot-x");
  });

  it("ne crée pas de lot pour un destinataire unique", () => {
    // Un batchId ferait afficher une ligne dépliable pour une seule
    // personne — un clic pour rien.
    const plan = planSend("contrat_formation", [dest(1)], "lot-x");
    expect(plan.batchId).toBeNull();
    expect(plan.documents).toHaveLength(1);
  });
});

describe("planSend — document commun", () => {
  it("ne produit qu'un exemplaire, quel que soit le nombre de destinataires", () => {
    const plan = planSend("internal_rules", [dest(1), dest(2), dest(3)], "lot-x");
    expect(plan.scope).toBe("single");
    expect(plan.documents).toHaveLength(1);
  });

  it("envoie cet exemplaire à tout le monde", () => {
    const plan = planSend("internal_rules", [dest(1), dest(2), dest(3)], "lot-x");
    expect(plan.documents[0].to).toHaveLength(3);
  });

  it("n'ajoute pas de nom au titre d'un document commun", () => {
    const plan = planSend("internal_rules", [dest(1), dest(2)], "lot-x");
    expect(plan.documents[0].titleSuffix).toBe("");
  });

  it("ne pose pas de batchId : il n'y a rien à compter", () => {
    expect(planSend("internal_rules", [dest(1), dest(2)], "lot-x").batchId).toBeNull();
  });

  it("traite la convention comme un document commun", () => {
    // Elle lie l'organisme à l'entreprise, pas à chaque salarié.
    expect(planSend("convention", [dest(1), dest(2)], "lot-x").documents).toHaveLength(1);
  });
});

describe("cas limites", () => {
  it("ne produit rien sans destinataire", () => {
    expect(planSend("contrat_formation", [], "lot-x").documents).toEqual([]);
    expect(planSend("internal_rules", [], "lot-x").documents).toEqual([]);
  });

  it("signale une adresse inutilisable avant l'envoi", () => {
    const mauvais = { ...dest(2), email: "" };
    expect(invalidRecipients([dest(1), mauvais])).toEqual([mauvais]);
    expect(invalidRecipients([dest(1), { ...dest(3), email: "pas-une-adresse" }])).toHaveLength(1);
  });

  it("ne signale rien quand toutes les adresses tiennent", () => {
    expect(invalidRecipients([dest(1), dest(2)])).toEqual([]);
  });
});
