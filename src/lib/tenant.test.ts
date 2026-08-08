import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  ASSIGNABLE_ADDITIONAL_ROLES,
  NON_CUMULABLE_ROLES,
  PERMISSIONS,
  accessSource,
  can,
  canAccessAccommodations,
  canAccessContact,
  canAccessSecureReports,
  canManageOpportunity,
  canManageSessionInvitations,
  canWithRoles,
  canWriteRgpd,
  effectiveRoles,
} from "./tenant";

const ALL_ROLES = Object.values(Role);
const ALL_FEATURES = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

// This is the one place a bug becomes a real cross-tenant/cross-role data
// leak — see the README's "worth flagging" section. Kept deliberately
// focused on the actual access decisions, not an exhaustive dump of every
// PERMISSIONS entry (that table is data, not logic; these functions are
// the logic built on top of it).

describe("can", () => {
  it("gives ADMIN_OF full access to a representative admin-only feature", () => {
    expect(can(Role.ADMIN_OF, "team")).toBe("full");
  });

  it("keeps LEARNER out of staff-facing features", () => {
    expect(can(Role.LEARNER, "crm")).toBe("none");
    expect(can(Role.LEARNER, "dashboard")).toBe("none");
  });

  // Regression guard: "planning" and "courses" used to be one key, which let
  // a LEARNER open /planning and read every session of the organisation (and
  // every course title through the global search) purely so that /formations
  // could show them their own enrolled courses. Splitting the two is what
  // fixes that, so both halves are asserted here — collapsing them back
  // reopens the leak.
  it("lets LEARNER reach their own courses without reaching the session planner", () => {
    expect(can(Role.LEARNER, "courses")).toBe("limited");
    expect(can(Role.LEARNER, "planning")).toBe("none");
  });

  it("keeps staff access identical across the courses/planning split", () => {
    for (const role of [Role.ADMIN_OF, Role.ADMIN_MANAGER, Role.SALES, Role.TRAINER]) {
      expect(can(role, "courses")).toBe(can(role, "planning"));
    }
  });

  it("gives TRAINER and LEARNER full access to the portal, and staff none", () => {
    expect(can(Role.TRAINER, "portal")).toBe("full");
    expect(can(Role.LEARNER, "portal")).toBe("full");
    expect(can(Role.ADMIN_OF, "portal")).toBe("none");
  });

  it("falls back to 'none' for an unknown feature key rather than throwing", () => {
    // Une clé inconnue est maintenant une erreur de compilation (PERMISSIONS
    // est déclaré avec `satisfies`, donc ses clés restent littérales) — d'où
    // le cast, qui simule ce qui peut encore arriver à l'exécution : une
    // valeur venue d'une URL, d'un JSON, ou d'un `any` non contrôlé. Le
    // repli reste la dernière ligne de défense, et il ferme l'accès.
    expect(can(Role.ADMIN_OF, "not_a_real_feature" as keyof typeof PERMISSIONS)).toBe("none");
  });
});

// ------------------------------------------------------------------
// CUMUL DE RÔLES
//
// Le vrai risque de ce chantier n'est pas que le cumul marche mal, c'est
// qu'il change quelque chose pour les 100 % de comptes qui n'ont AUCUN
// rôle cumulé. D'où le premier bloc, exhaustif, avant tout le reste.
// ------------------------------------------------------------------

describe("rétrocompatibilité — un seul rôle", () => {
  it("donne exactement la case de la matrice, pour chaque rôle et chaque fonctionnalité", () => {
    for (const role of ALL_ROLES) {
      for (const feature of ALL_FEATURES) {
        expect(can(role, feature)).toBe(PERMISSIONS[feature][role]);
      }
    }
  });

  it("traite `role` et `[role]` de façon indiscernable", () => {
    for (const role of ALL_ROLES) {
      for (const feature of ALL_FEATURES) {
        expect(can([role], feature)).toBe(can(role, feature));
      }
    }
  });

  it("laisse un compte sans rôle cumulé avec ses seuls droits d'origine", () => {
    for (const role of ALL_ROLES) {
      expect(effectiveRoles(role, [])).toEqual([role]);
      expect(effectiveRoles(role)).toEqual([role]);
      for (const feature of ALL_FEATURES) {
        expect(can(effectiveRoles(role, []), feature)).toBe(can(role, feature));
      }
    }
  });

  it("ferme l'accès pour une liste de rôles vide plutôt que d'ouvrir", () => {
    expect(canWithRoles([], "dossiers")).toBe("none");
    expect(canWithRoles([], "faq")).toBe("none");
  });

  it("garde le repli 'none' sur une clé inconnue, même avec plusieurs rôles", () => {
    expect(can([Role.ADMIN_OF, Role.SALES], "not_a_real_feature" as keyof typeof PERMISSIONS)).toBe("none");
  });
});

describe("canWithRoles — le meilleur des rôles", () => {
  // Le cas qui a motivé tout le chantier.
  const formateurCommercial = effectiveRoles(Role.TRAINER, [Role.SALES]);

  it("donne au formateur-commercial le CRM que son rôle principal lui refusait", () => {
    expect(can(Role.TRAINER, "crm")).toBe("none");
    expect(can(formateurCommercial, "crm")).toBe("limited");
    expect(can(formateurCommercial, "inbox")).toBe("limited");
  });

  it("ne lui retire rien de ce que son rôle principal lui donnait", () => {
    // "portal" est le test qui mord : le formateur l'a en "full", le
    // commercial pas du tout. Un cumul qui prendrait le dernier rôle, ou
    // le plus récent, ferait disparaître son espace personnel.
    expect(can(Role.SALES, "portal")).toBe("none");
    expect(can(formateurCommercial, "portal")).toBe("full");
    expect(can(formateurCommercial, "dossiers")).toBe(can(Role.TRAINER, "dossiers"));
  });

  it("n'ouvre rien qu'aucun des deux rôles n'ouvrait", () => {
    expect(can(formateurCommercial, "invoicing")).toBe("none");
    expect(can(formateurCommercial, "qualiopi")).toBe("none");
    expect(can(formateurCommercial, "team")).toBe("none");
  });

  it("fait gagner 'full' contre 'limited', dans les deux sens de lecture", () => {
    expect(can(Role.TRAINER, "dossiers")).toBe("limited");
    expect(can(Role.ADMIN_MANAGER, "dossiers")).toBe("full");
    expect(canWithRoles([Role.TRAINER, Role.ADMIN_MANAGER], "dossiers")).toBe("full");
    expect(canWithRoles([Role.ADMIN_MANAGER, Role.TRAINER], "dossiers")).toBe("full");
  });

  it("ne dépend jamais de l'ordre des rôles", () => {
    for (const feature of ALL_FEATURES) {
      expect(canWithRoles([Role.TRAINER, Role.SALES, Role.ADMIN_MANAGER], feature)).toBe(
        canWithRoles([Role.ADMIN_MANAGER, Role.SALES, Role.TRAINER], feature),
      );
    }
  });
});

describe("accessSource — d'où vient le niveau", () => {
  it("nomme le rôle qui ouvre l'accès, pour que l'écran Équipe puisse l'écrire", () => {
    const roles = effectiveRoles(Role.TRAINER, [Role.SALES]);
    expect(accessSource(roles, "crm")).toEqual({ level: "limited", sourceRole: Role.SALES });
  });

  it("attribue au rôle principal ce qu'il donnait déjà, même à égalité", () => {
    const roles = effectiveRoles(Role.TRAINER, [Role.SALES]);
    // Les deux rôles ont "messagerie: full" — la paternité revient au
    // premier de la liste, sinon un accès inchangé se lirait « issu de
    // Commercial » et laisserait croire qu'il vient d'être accordé.
    expect(accessSource(roles, "messagerie")).toEqual({ level: "full", sourceRole: Role.TRAINER });
  });

  it("ne désigne aucune source quand il n'y a pas d'accès", () => {
    expect(accessSource(effectiveRoles(Role.TRAINER, [Role.SALES]), "billing")).toEqual({
      level: "none",
      sourceRole: null,
    });
  });
});

describe("rôles non cumulables", () => {
  it("refuse LEARNER : un apprenant est un client, pas un membre de l'équipe", () => {
    expect(NON_CUMULABLE_ROLES).toContain(Role.LEARNER);
    expect(ASSIGNABLE_ADDITIONAL_ROLES).not.toContain(Role.LEARNER);
  });

  // La route renvoie 400 (premier verrou, non couvert ici : les handlers
  // touchent Prisma à l'import). effectiveRoles est le second verrou, celui
  // qui tient même si la ligne a été écrite par un seed ou du SQL à la main.
  it("écarte LEARNER à la lecture, sans quoi un commercial gagnerait l'espace apprenant", () => {
    expect(can(Role.LEARNER, "portal")).toBe("full");
    expect(effectiveRoles(Role.SALES, [Role.LEARNER])).toEqual([Role.SALES]);
    expect(can(effectiveRoles(Role.SALES, [Role.LEARNER]), "portal")).toBe("none");
  });

  it("écarte ADMIN_OF : un organisme n'a qu'un seul propriétaire", () => {
    expect(NON_CUMULABLE_ROLES).toContain(Role.ADMIN_OF);
    expect(ASSIGNABLE_ADDITIONAL_ROLES).not.toContain(Role.ADMIN_OF);
    expect(effectiveRoles(Role.SALES, [Role.ADMIN_OF])).toEqual([Role.SALES]);
    expect(can(effectiveRoles(Role.SALES, [Role.ADMIN_OF]), "team")).toBe("none");
  });

  it("garde le rôle PRINCIPAL même quand il est non cumulable", () => {
    // Le filtre ne porte que sur les casquettes ajoutées : un apprenant
    // reste un apprenant, et son espace ne doit pas se fermer.
    expect(effectiveRoles(Role.LEARNER, [])).toEqual([Role.LEARNER]);
    expect(can(effectiveRoles(Role.LEARNER, []), "portal")).toBe("full");
    expect(effectiveRoles(Role.ADMIN_OF, [])).toEqual([Role.ADMIN_OF]);
  });

  it("dédoublonne, y compris le rôle principal répété en rôle cumulé", () => {
    expect(effectiveRoles(Role.TRAINER, [Role.SALES, Role.SALES, Role.TRAINER])).toEqual([
      Role.TRAINER,
      Role.SALES,
    ]);
  });
});

describe("canWriteRgpd", () => {
  it("lets ADMIN_OF write to the GDPR register", () => {
    expect(canWriteRgpd(Role.ADMIN_OF)).toBe(true);
  });

  it("garde le DPO externe en lecture seule même cumulé à un rôle sans RGPD", () => {
    // Le cumul donne "rgpd: limited" (venu du DPO), mais aucune des deux
    // casquettes n'écrit : le formateur n'a pas le registre, le DPO ne
    // l'écrit pas. Tester le niveau cumulé au lieu du rôle qui l'ouvre
    // aurait rendu le registre écrivable ici.
    expect(can([Role.TRAINER, Role.DPO_EXTERNAL], "rgpd")).toBe("limited");
    expect(canWriteRgpd([Role.TRAINER, Role.DPO_EXTERNAL])).toBe(false);
  });

  it("laisse écrire dès qu'une des casquettes en a le droit", () => {
    expect(canWriteRgpd([Role.DPO_EXTERNAL, Role.ADMIN_MANAGER])).toBe(true);
  });

  it("keeps DPO_EXTERNAL strictly read-only even though they have rgpd access", () => {
    expect(can(Role.DPO_EXTERNAL, "rgpd")).not.toBe("none");
    expect(canWriteRgpd(Role.DPO_EXTERNAL)).toBe(false);
  });

  it("blocks roles with no rgpd access at all", () => {
    expect(canWriteRgpd(Role.TRAINER)).toBe(false);
  });
});

describe("canManageSessionInvitations", () => {
  const otherTrainerSession = { trainerId: "user-b" };
  const ownSession = { trainerId: "user-a" };
  const unassignedSession = { trainerId: null };

  it("always allows ADMIN_OF and ADMIN_MANAGER, regardless of ownership", () => {
    expect(canManageSessionInvitations(Role.ADMIN_OF, "user-a", otherTrainerSession)).toBe(true);
    expect(canManageSessionInvitations(Role.ADMIN_MANAGER, "user-a", otherTrainerSession)).toBe(true);
  });

  it("allows a TRAINER only for their own session", () => {
    expect(canManageSessionInvitations(Role.TRAINER, "user-a", ownSession)).toBe(true);
    expect(canManageSessionInvitations(Role.TRAINER, "user-a", otherTrainerSession)).toBe(false);
    expect(canManageSessionInvitations(Role.TRAINER, "user-a", unassignedSession)).toBe(false);
  });

  it("blocks every other role outright", () => {
    expect(canManageSessionInvitations(Role.SALES, "user-a", ownSession)).toBe(false);
    expect(canManageSessionInvitations(Role.LEARNER, "user-a", ownSession)).toBe(false);
  });

  it("suit le cumul : la casquette formateur suffit, sur sa propre session", () => {
    const cumul = effectiveRoles(Role.SALES, [Role.TRAINER]);
    expect(canManageSessionInvitations(cumul, "user-a", ownSession)).toBe(true);
    // La propriété reste exigée : cumuler des rôles n'élargit pas le
    // périmètre de chacun d'eux.
    expect(canManageSessionInvitations(cumul, "user-a", otherTrainerSession)).toBe(false);
  });
});

describe("canManageOpportunity", () => {
  it("always allows ADMIN_OF/ADMIN_MANAGER", () => {
    expect(canManageOpportunity(Role.ADMIN_OF, "user-a", { ownerId: "user-b" })).toBe(true);
  });

  it("allows SALES only for opportunities they own", () => {
    expect(canManageOpportunity(Role.SALES, "user-a", { ownerId: "user-a" })).toBe(true);
    expect(canManageOpportunity(Role.SALES, "user-a", { ownerId: "user-b" })).toBe(false);
    expect(canManageOpportunity(Role.SALES, "user-a", { ownerId: null })).toBe(false);
  });

  it("blocks non-sales, non-admin roles", () => {
    expect(canManageOpportunity(Role.TRAINER, "user-a", { ownerId: "user-a" })).toBe(false);
  });

  it("suit le cumul : le formateur-commercial gère les opportunités qu'il possède", () => {
    const cumul = effectiveRoles(Role.TRAINER, [Role.SALES]);
    expect(canManageOpportunity(cumul, "user-a", { ownerId: "user-a" })).toBe(true);
    expect(canManageOpportunity(cumul, "user-a", { ownerId: "user-b" })).toBe(false);
  });
});

describe("canAccessContact", () => {
  it("requires SALES to own at least one of the contact's opportunities, not all", () => {
    const opportunities = [{ ownerId: "user-b" }, { ownerId: "user-a" }];
    expect(canAccessContact(Role.SALES, "user-a", opportunities)).toBe(true);
    expect(canAccessContact(Role.SALES, "user-c", opportunities)).toBe(false);
  });

  it("denies SALES a contact with zero opportunities", () => {
    expect(canAccessContact(Role.SALES, "user-a", [])).toBe(false);
  });

  it("always allows admins regardless of ownership", () => {
    expect(canAccessContact(Role.ADMIN_OF, "user-a", [{ ownerId: "user-b" }])).toBe(true);
  });
});

describe("canAccessAccommodations", () => {
  it("allows only the designated référent handicap outside of admins", () => {
    const org = { referentHandicapUserId: "user-a" };
    expect(canAccessAccommodations(Role.TRAINER, "user-a", org)).toBe(true);
    expect(canAccessAccommodations(Role.TRAINER, "user-b", org)).toBe(false);
  });

  it("denies everyone when no référent is configured", () => {
    expect(canAccessAccommodations(Role.TRAINER, "user-a", { referentHandicapUserId: null })).toBe(false);
  });

  it("always allows admins", () => {
    expect(canAccessAccommodations(Role.ADMIN_MANAGER, "user-a", { referentHandicapUserId: null })).toBe(true);
  });
});

describe("canAccessSecureReports", () => {
  it("is restricted to ADMIN_OF only — deliberately narrower than accommodations", () => {
    expect(canAccessSecureReports(Role.ADMIN_OF)).toBe(true);
    expect(canAccessSecureReports(Role.ADMIN_MANAGER)).toBe(false);
    expect(canAccessSecureReports(Role.TRAINER)).toBe(false);
  });

  it("reste fermé au plus gros cumul possible — ADMIN_OF ne se cumule pas", () => {
    // Un signalement peut viser n'importe qui, y compris le responsable
    // administratif. Aucune addition de casquettes ne doit y donner accès.
    const cumulMaximal = effectiveRoles(Role.ADMIN_MANAGER, ASSIGNABLE_ADDITIONAL_ROLES);
    expect(canAccessSecureReports(cumulMaximal)).toBe(false);
  });
});
