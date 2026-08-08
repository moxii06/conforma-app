import { describe, expect, it } from "vitest";
import { Role, SessionMode } from "@prisma/client";
import { coordonneesMasquees, donneesSanteMasquees, finDeFormation } from "./rgpdMasking";

// Une règle juridique : ce que ces tests fixent, c'est ce que l'organisme
// devra défendre devant la CNIL. Les cas limites y sont donc traités comme
// le cœur du sujet, pas comme des détails — « la veille » et « le
// lendemain » sont exactement là où un contrôle regarde.

const FIN = new Date(2026, 4, 15); // 15 mai 2026, fin de session
const FORMATEUR = [Role.TRAINER];

function ctx(roles: Role[], maintenant: Date, finFormation: Date | null = FIN) {
  return { roles, finFormation, maintenant };
}

describe("coordonneesMasquees", () => {
  it("laisse voir le formateur pendant la formation et le mois qui suit", () => {
    expect(coordonneesMasquees(ctx(FORMATEUR, new Date(2026, 3, 1)))).toBe(false); // avant la fin
    expect(coordonneesMasquees(ctx(FORMATEUR, new Date(2026, 4, 16)))).toBe(false); // le lendemain
    expect(coordonneesMasquees(ctx(FORMATEUR, new Date(2026, 5, 14)))).toBe(false); // la veille du terme
  });

  it("masque au formateur à partir d'un mois après la fin", () => {
    expect(coordonneesMasquees(ctx(FORMATEUR, new Date(2026, 5, 15)))).toBe(true);
    expect(coordonneesMasquees(ctx(FORMATEUR, new Date(2029, 0, 1)))).toBe(true);
  });

  it("ne masque jamais aux rôles dont c'est la donnée de travail", () => {
    const bienApres = new Date(2029, 0, 1);
    expect(coordonneesMasquees(ctx([Role.ADMIN_OF], bienApres))).toBe(false);
    expect(coordonneesMasquees(ctx([Role.ADMIN_MANAGER], bienApres))).toBe(false);
    expect(coordonneesMasquees(ctx([Role.DPO_EXTERNAL], bienApres))).toBe(false);
    // Le commercial poursuit une autre finalité — la relation client — qui
    // ne s'éteint pas avec la session.
    expect(coordonneesMasquees(ctx([Role.SALES], bienApres))).toBe(false);
  });

  it("tient compte des rôles cumulés, pas seulement du principal", () => {
    // Un responsable pédagogique qui anime aussi une session ne doit pas
    // perdre par sa seconde casquette ce que la première lui accorde.
    const bienApres = new Date(2029, 0, 1);
    expect(coordonneesMasquees(ctx([Role.TRAINER, Role.ADMIN_MANAGER], bienApres))).toBe(false);
    expect(coordonneesMasquees(ctx([Role.TRAINER, Role.SALES], bienApres))).toBe(false);
  });

  it("ne masque rien tant que la fin de formation est inconnue", () => {
    // Masquer sur une date qu'on ne connaît pas serait aussi faux que ne
    // jamais masquer — et invérifiable.
    expect(coordonneesMasquees(ctx(FORMATEUR, new Date(2029, 0, 1), null))).toBe(false);
  });
});

describe("donneesSanteMasquees", () => {
  it("coupe dès la fin de la formation, sans délai de grâce", () => {
    expect(donneesSanteMasquees(ctx(FORMATEUR, new Date(2026, 4, 14)))).toBe(false);
    expect(donneesSanteMasquees(ctx(FORMATEUR, FIN))).toBe(true);
    expect(donneesSanteMasquees(ctx(FORMATEUR, new Date(2026, 4, 16)))).toBe(true);
  });

  it("est plus stricte que les coordonnées sur le mois qui suit", () => {
    // Le mois de grâce se justifie par l'évaluation à chaud et
    // l'attestation ; aucune de ces suites n'a besoin des données de santé.
    const troisJoursApres = new Date(2026, 4, 18);
    expect(coordonneesMasquees(ctx(FORMATEUR, troisJoursApres))).toBe(false);
    expect(donneesSanteMasquees(ctx(FORMATEUR, troisJoursApres))).toBe(true);
  });

  it("garde le cercle des données sensibles plus étroit que celui des coordonnées", () => {
    const bienApres = new Date(2029, 0, 1);
    expect(donneesSanteMasquees(ctx([Role.ADMIN_OF], bienApres))).toBe(false);
    expect(donneesSanteMasquees(ctx([Role.ADMIN_MANAGER], bienApres))).toBe(false);
    // Un formateur également commercial garde les coordonnées mais PAS les
    // données de santé : SALES n'a jamais eu accès à l'article 9.
    expect(coordonneesMasquees(ctx([Role.TRAINER, Role.SALES], bienApres))).toBe(false);
    expect(donneesSanteMasquees(ctx([Role.TRAINER, Role.SALES], bienApres))).toBe(true);
  });
});

describe("finDeFormation", () => {
  const base = { sessionEndsAt: FIN, firstAccessedAt: null, accessDurationDays: null, dossierArchiveLe: null };

  it("prend la date de fin d'une session datée", () => {
    expect(finDeFormation({ ...base, mode: SessionMode.FIXED_DATE })).toEqual(FIN);
  });

  it("ignore le endsAt d'une session en continu — c'est un remplissage, pas une date", () => {
    const premierAcces = new Date(2026, 0, 10);
    expect(
      finDeFormation({
        ...base,
        mode: SessionMode.ROLLING,
        firstAccessedAt: premierAcces,
        accessDurationDays: 30,
      })
    ).toEqual(new Date(2026, 1, 9));
  });

  it("retombe sur la clôture du dossier quand l'accès n'a pas de terme", () => {
    const cloture = new Date(2026, 6, 1);
    expect(finDeFormation({ ...base, mode: SessionMode.ROLLING, dossierArchiveLe: cloture })).toEqual(cloture);
  });

  it("rend null quand une formation en continu n'a ni terme d'accès ni clôture", () => {
    expect(finDeFormation({ ...base, mode: SessionMode.ROLLING })).toBeNull();
  });
});
