import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  can,
  canAccessAccommodations,
  canAccessContact,
  canAccessSecureReports,
  canManageOpportunity,
  canManageSessionInvitations,
  canWriteRgpd,
  type PERMISSIONS,
} from "./tenant";

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

describe("canWriteRgpd", () => {
  it("lets ADMIN_OF write to the GDPR register", () => {
    expect(canWriteRgpd(Role.ADMIN_OF)).toBe(true);
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
});
