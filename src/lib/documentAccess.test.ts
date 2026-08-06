import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { peutLireDocument, type DocumentPourAcces } from "./documentAccess";

const dossierDe = (learnerUserId: string | null, trainerId: string | null = "form1"): DocumentPourAcces => ({
  dossierId: "d1",
  dossier: { learnerUserId, session: { trainerId } },
});

/** Un document de fiche membre / prestataire : aucun dossier apprenant. */
const DOC_EQUIPE: DocumentPourAcces = { dossierId: null, dossier: null };

describe("peutLireDocument — apprenant", () => {
  it("lit son propre document", () => {
    expect(peutLireDocument(dossierDe("appr1"), { role: Role.LEARNER, userId: "appr1" })).toBe(true);
  });

  it("NE lit PAS le document d'un autre apprenant du même organisme", () => {
    // Le défaut qui a motivé ce module : la route « generated » ne vérifiait
    // que l'organisation, et l'URL part par email à chaque apprenant.
    expect(peutLireDocument(dossierDe("appr2"), { role: Role.LEARNER, userId: "appr1" })).toBe(false);
  });

  it("ne lit pas un document de fiche équipe", () => {
    expect(peutLireDocument(DOC_EQUIPE, { role: Role.LEARNER, userId: "appr1" })).toBe(false);
  });

  it("ne lit pas un dossier sans apprenant rattaché", () => {
    expect(peutLireDocument(dossierDe(null), { role: Role.LEARNER, userId: "appr1" })).toBe(false);
  });
});

describe("peutLireDocument — formateur", () => {
  it("lit un document de SA session", () => {
    expect(peutLireDocument(dossierDe("appr1", "form1"), { role: Role.TRAINER, userId: "form1" })).toBe(true);
  });

  it("ne lit pas un document de la session d'un autre formateur", () => {
    expect(peutLireDocument(dossierDe("appr1", "form2"), { role: Role.TRAINER, userId: "form1" })).toBe(false);
  });
});

describe("peutLireDocument — équipe", () => {
  it("l'administrateur lit un document de dossier", () => {
    expect(peutLireDocument(dossierDe("appr1"), { role: Role.ADMIN_OF, userId: "admin" })).toBe(true);
  });

  it("l'administrateur lit un document de fiche équipe", () => {
    expect(peutLireDocument(DOC_EQUIPE, { role: Role.ADMIN_OF, userId: "admin" })).toBe(true);
  });

  it("un rôle sans accès aux dossiers est refusé sur un document de dossier", () => {
    // DPO externe : accès RGPD, pas aux dossiers pédagogiques.
    expect(peutLireDocument(dossierDe("appr1"), { role: Role.DPO_EXTERNAL, userId: "dpo" })).toBe(false);
  });
});
