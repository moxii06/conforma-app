import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { peutUtiliserMessagerie, compterNonLus, titreConversation, cleTeteATete } from "./messagerie";
import { PERMISSIONS } from "./tenant";

// Deux endroits décident de l'accès : PERMISSIONS.messagerie (la navigation et
// la garde de page) et ROLES_MESSAGERIE (les routes). Un commentaire demandant
// de les tenir d'accord ne garantit rien — ce test, si.
describe("accord entre la matrice de permissions et les routes", () => {
  it("ouvre la messagerie aux mêmes rôles des deux côtés", () => {
    for (const [role, niveau] of Object.entries(PERMISSIONS.messagerie)) {
      expect(peutUtiliserMessagerie(role as never)).toBe(niveau !== "none");
    }
  });
});

describe("peutUtiliserMessagerie", () => {
  it("ouvre la messagerie à l'équipe de l'organisme", () => {
    expect(peutUtiliserMessagerie(Role.ADMIN_OF)).toBe(true);
    expect(peutUtiliserMessagerie(Role.ADMIN_MANAGER)).toBe(true);
    expect(peutUtiliserMessagerie(Role.SALES)).toBe(true);
    expect(peutUtiliserMessagerie(Role.TRAINER)).toBe(true);
  });

  // Un apprenant n'est pas un collègue : lui ouvrir la messagerie lui
  // donnerait l'annuaire nominatif du personnel.
  it("la ferme à l'apprenant et au DPO externe", () => {
    expect(peutUtiliserMessagerie(Role.LEARNER)).toBe(false);
    expect(peutUtiliserMessagerie(Role.DPO_EXTERNAL)).toBe(false);
  });
});

describe("compterNonLus", () => {
  const messages = [
    { authorId: "claire", createdAt: "2026-08-06T10:00:00Z" },
    { authorId: "moi", createdAt: "2026-08-06T11:00:00Z" },
    { authorId: "claire", createdAt: "2026-08-06T12:00:00Z" },
    { authorId: "thomas", createdAt: "2026-08-06T13:00:00Z" },
  ];

  it("compte ce qui est arrivé après ma dernière lecture", () => {
    expect(compterNonLus(messages, "moi", "2026-08-06T11:30:00Z")).toBe(2);
  });

  // Sans l'exclusion de l'auteur, écrire ferait grimper mon propre compteur.
  it("ne compte jamais mes propres messages", () => {
    expect(compterNonLus(messages, "moi", "2026-08-06T09:00:00Z")).toBe(3);
  });

  it("ne compte rien quand tout a été lu", () => {
    expect(compterNonLus(messages, "moi", "2026-08-06T23:59:00Z")).toBe(0);
  });

  it("survit à une conversation vide", () => {
    expect(compterNonLus([], "moi", "2026-08-06T10:00:00Z")).toBe(0);
  });
});

describe("titreConversation", () => {
  const membres = [
    { userId: "moi", name: "Gu" },
    { userId: "claire", name: "Claire Bonnet" },
  ];

  it("nomme un tête-à-tête d'après l'autre personne", () => {
    expect(titreConversation({ titre: null, estGroupe: false }, membres, "moi")).toBe("Claire Bonnet");
  });

  // Le même fil, vu d'en face, porte l'autre nom : c'est bien pour ça qu'on
  // ne stocke aucun titre sur un tête-à-tête.
  it("nomme le même fil différemment selon qui regarde", () => {
    expect(titreConversation({ titre: null, estGroupe: false }, membres, "claire")).toBe("Gu");
  });

  it("préfère le titre du groupe quand il existe", () => {
    expect(titreConversation({ titre: "Rentrée septembre", estGroupe: true }, membres, "moi")).toBe(
      "Rentrée septembre",
    );
  });

  it("liste les membres d'un groupe sans titre, moi excepté", () => {
    const groupe = [...membres, { userId: "thomas", name: "Thomas Marchand" }];
    expect(titreConversation({ titre: null, estGroupe: true }, groupe, "moi")).toBe("Claire Bonnet, Thomas Marchand");
  });

  it("abrège au-delà de trois autres membres", () => {
    const grand = [
      { userId: "moi", name: "Gu" },
      { userId: "a", name: "Claire" },
      { userId: "b", name: "Thomas" },
      { userId: "c", name: "Marie" },
      { userId: "d", name: "Julien" },
      { userId: "e", name: "Nadia" },
    ];
    expect(titreConversation({ titre: null, estGroupe: true }, grand, "moi")).toBe("Claire, Thomas, Marie +2");
  });

  it("ne laisse pas un titre vide passer pour un titre", () => {
    expect(titreConversation({ titre: "   ", estGroupe: false }, membres, "moi")).toBe("Claire Bonnet");
  });
});

describe("cleTeteATete", () => {
  // Sans le tri, A→B et B→A ouvriraient deux fils parallèles et chacun
  // croirait que l'autre ne répond pas.
  it("donne la même clé quel que soit l'ordre", () => {
    expect(cleTeteATete("a", "b")).toBe(cleTeteATete("b", "a"));
  });

  it("distingue deux paires différentes", () => {
    expect(cleTeteATete("a", "b")).not.toBe(cleTeteATete("a", "c"));
  });
});
