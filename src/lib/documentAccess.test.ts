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

describe("peutLireDocument — cumul de rôles", () => {
  it("une liste à un seul rôle rend exactement ce que rend ce rôle seul", () => {
    // L'invariant de tout le chantier : `roles` absent (appelant pas encore
    // câblé) et `roles: [role]` (le cas de tous les comptes sans casquette
    // secondaire) doivent être indiscernables.
    const document = dossierDe("appr1", "form2");
    expect(peutLireDocument(document, { role: Role.TRAINER, userId: "form1" })).toBe(false);
    expect(peutLireDocument(document, { role: Role.TRAINER, roles: [Role.TRAINER], userId: "form1" })).toBe(false);

    const sienne = dossierDe("appr1", "form1");
    expect(peutLireDocument(sienne, { role: Role.TRAINER, userId: "form1" })).toBe(true);
    expect(peutLireDocument(sienne, { role: Role.TRAINER, roles: [Role.TRAINER], userId: "form1" })).toBe(true);
  });

  it("le DPO externe devenu aussi formateur lit SA session", () => {
    expect(
      peutLireDocument(dossierDe("appr1", "form1"), {
        role: Role.DPO_EXTERNAL,
        roles: [Role.DPO_EXTERNAL, Role.TRAINER],
        userId: "form1",
      }),
    ).toBe(true);
  });

  it("le DPO externe devenu aussi formateur NE lit PAS la session d'un autre", () => {
    // Le piège de ce chantier : la condition de propriété est attachée à la
    // casquette formateur, pas au rôle principal. Testée sur le principal
    // (DPO_EXTERNAL), elle ne se refermerait sur rien — et ce lecteur verrait
    // TOUS les documents de l'organisme, plus qu'un vrai formateur.
    expect(
      peutLireDocument(dossierDe("appr1", "form2"), {
        role: Role.DPO_EXTERNAL,
        roles: [Role.DPO_EXTERNAL, Role.TRAINER],
        userId: "form1",
      }),
    ).toBe(false);
  });

  it("la casquette secondaire n'ouvre pas la fiche équipe qu'elle n'ouvre pas non plus seule", () => {
    // « team » est réservé à ADMIN_OF, qui ne se cumule pas : aucune addition
    // de casquettes ne doit ouvrir cette porte.
    expect(
      peutLireDocument(DOC_EQUIPE, {
        role: Role.DPO_EXTERNAL,
        roles: [Role.DPO_EXTERNAL, Role.TRAINER, Role.SALES, Role.ADMIN_MANAGER],
        userId: "dpo",
      }),
    ).toBe(false);
  });

  it("le formateur devenu aussi commercial obtient ce que la casquette commerciale donne déjà", () => {
    // Le cumul ADDITIONNE des droits existants : un commercial lit les
    // documents de dossier de l'organisme (PERMISSIONS.dossiers = limited,
    // sans condition de propriété côté documents). Ajouter cette casquette à
    // un formateur ne peut pas lui en retirer.
    expect(peutLireDocument(dossierDe("appr1", "form2"), { role: Role.SALES, userId: "com1" })).toBe(true);
    expect(
      peutLireDocument(dossierDe("appr1", "form2"), {
        role: Role.TRAINER,
        roles: [Role.TRAINER, Role.SALES],
        userId: "form1",
      }),
    ).toBe(true);
  });
});
