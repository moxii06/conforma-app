import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import {
  borneAuxSiens,
  borneAuxSiennesDuFormateur,
  borneAuxSiensDuCommercial,
  SANS_BORNE_COMMERCIAL,
  SANS_BORNE_FORMATEUR,
} from "./proprieteRoles";

// L'invariant de ce fichier était garanti par un commentaire seul, alors que
// trente emplacements en dépendent. Il est ici verrouillé par des assertions,
// comme tenant.test.ts le fait déjà pour son jumeau `can(effectiveRoles(r, []))`.

const TOUS_LES_ROLES = Object.values(Role);

describe("borneAuxSiens — l'invariant non négociable", () => {
  // Le seul énoncé qui rend ce changement déployable : sans rôle secondaire,
  // le prédicat doit valoir EXACTEMENT l'ancien `role === Role.X`. Toute
  // divergence ici est une régression sur 100 % des comptes existants.
  it.each(TOUS_LES_ROLES)("%s seul : la borne formateur vaut role === TRAINER", (r) => {
    expect(borneAuxSiennesDuFormateur([r])).toBe(r === Role.TRAINER);
  });

  it.each(TOUS_LES_ROLES)("%s seul : la borne commerciale vaut role === SALES", (r) => {
    expect(borneAuxSiensDuCommercial([r])).toBe(r === Role.SALES);
  });

  it("aucun rôle « sans borne » n'est lui-même un rôle restrictif", () => {
    // Si cette assertion tombait, un rôle pur se lèverait sa propre borne et
    // l'équivalence ci-dessus cesserait de tenir — d'où le test explicite.
    expect(SANS_BORNE_FORMATEUR).not.toContain(Role.TRAINER);
    expect(SANS_BORNE_COMMERCIAL).not.toContain(Role.SALES);
  });
});

describe("borneAuxSiens — ce que le cumul change", () => {
  it("formateur + commercial : borné sur le CRM, c'était la fuite", () => {
    // Avant : `role === "SALES"` était faux (le principal est TRAINER), donc
    // aucun filtre — cette personne lisait TOUT le pipeline de l'organisme,
    // strictement plus qu'un commercial pur. can() ouvrait la porte et la
    // serrure ne suivait pas.
    expect(borneAuxSiensDuCommercial([Role.TRAINER, Role.SALES])).toBe(true);
  });

  it("formateur + commercial : plus borné sur les dossiers, un commercial seul les voit déjà tous", () => {
    // Le miroir. Garder la borne ici ferait qu'ajouter la casquette formateur
    // à un commercial lui RETIRE des dossiers : un cumul qui soustrait.
    expect(borneAuxSiennesDuFormateur([Role.TRAINER, Role.SALES])).toBe(false);
  });

  it("DPO externe + formateur : redevient borné à ses propres sessions", () => {
    expect(borneAuxSiennesDuFormateur([Role.DPO_EXTERNAL, Role.TRAINER])).toBe(true);
  });

  it("un rôle administratif en casquette secondaire lève la borne", () => {
    expect(borneAuxSiennesDuFormateur([Role.TRAINER, Role.ADMIN_MANAGER])).toBe(false);
    expect(borneAuxSiensDuCommercial([Role.SALES, Role.ADMIN_MANAGER])).toBe(false);
  });

  it("sans le rôle restrictif, aucune borne — même avec plusieurs casquettes", () => {
    expect(borneAuxSiennesDuFormateur([Role.SALES, Role.DPO_EXTERNAL])).toBe(false);
    expect(borneAuxSiensDuCommercial([Role.TRAINER, Role.DPO_EXTERNAL])).toBe(false);
  });

  it("liste vide : rien à borner plutôt qu'une exception", () => {
    expect(borneAuxSiens([], Role.TRAINER, SANS_BORNE_FORMATEUR)).toBe(false);
  });
});
