import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * Multi-tenant isolation strategy (Phase 1): shared schema, every query
 * scoped by organizationId at the application layer.
 *
 * This is the ONE place tenant scoping should be reasoned about. Every
 * data-fetching function in the app should go through helpers here (or
 * follow the same pattern) rather than re-deriving organizationId ad hoc
 * in each page/route — that's how tenant leaks happen.
 *
 * Open question for the developer (see spec §10): whether to also add
 * Postgres row-level security as defense-in-depth once the schema
 * stabilizes, instead of relying solely on application-level scoping.
 */

export type SessionContext = {
  userId: string;
  organizationId: string;
  role: Role;
  name: string;
  email: string;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const { id, organizationId, role, name, email } = session.user;
  if (!id || !organizationId || !role) return null;
  return { userId: id, organizationId, role, name: name ?? "", email: email ?? "" };
}

// Use in server components / route handlers that require an authenticated,
// tenant-scoped session — redirects to /login rather than forcing every
// caller to null-check. The (app) route group layout already gates on
// auth, so in practice this redirect is a defense-in-depth backstop.
export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

// Permission matrix mirrors the one shown in the prototype's "Équipe et
// rôles" screen. Keep this as the single source of truth for access
// checks — the UI matrix should be generated FROM this, not maintained
// separately, or the two will drift.
export type AccessLevel = "full" | "limited" | "none";

export const FEATURE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord",
  crm: "CRM commercial",
  invoicing: "Facturation",
  planning: "Planning des sessions",
  dossiers: "Dossiers apprenants",
  qualiopi: "Conformité Qualiopi",
  rgpd: "Registre RGPD",
  toolkit: "Toolkit documents",
  integrations: "Intégrations",
  team: "Équipe & rôles",
  inbox: "Boîte mail",
  bpf: "Bilan pédagogique et financier",
  portal: "Mon espace",
  faq: "FAQ & guides",
  support: "Réclamations & signalement",
};

export const PERMISSIONS: Record<string, Record<Role, AccessLevel>> = {
  dashboard: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  crm: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "limited", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  invoicing: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  planning: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "limited", DPO_EXTERNAL: "none" },
  dossiers: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  qualiopi: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "none", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  rgpd: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "limited" },
  toolkit: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  integrations: { ADMIN_OF: "full", ADMIN_MANAGER: "none", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  team: { ADMIN_OF: "full", ADMIN_MANAGER: "none", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  inbox: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  bpf: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  // The admin-facing nav filters this one out for everyone except the two
  // roles it exists for — Admin/Manager/Sales/DPO manage the org from the
  // regular screens, they don't need the simplified self-service view.
  portal: { ADMIN_OF: "none", ADMIN_MANAGER: "none", SALES: "none", TRAINER: "full", LEARNER: "full", DPO_EXTERNAL: "none" },
  // Help content — same for every role, no write action exists on this
  // page so "full" vs "limited" doesn't mean anything here; it's just on/off.
  faq: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "full", TRAINER: "full", LEARNER: "full", DPO_EXTERNAL: "full" },
  // Submission (complaint or secure report) is open to every role — the
  // whole point of a reporting channel is that it's reachable by anyone,
  // including a LEARNER. Who can then READ a Complaint or SecureReport is a
  // separate, narrower check (see canAccessSecureReports and the "dossiers"
  // feature reused for complaint visibility) — this flag only gates whether
  // the page exists for you at all.
  support: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "full", TRAINER: "full", LEARNER: "full", DPO_EXTERNAL: "full" },
};

export function can(role: Role, feature: keyof typeof PERMISSIONS): AccessLevel {
  return PERMISSIONS[feature]?.[role] ?? "none";
}

// DPO_EXTERNAL is explicitly read-only on the GDPR register per spec §2
// ("External DPO: Read-only access to the GDPR register and AIPD/DPA
// module") — "limited" in PERMISSIONS means scoped-but-writable for every
// other role that has it, but specifically means no writes for this one.
export function canWriteRgpd(role: Role): boolean {
  return can(role, "rgpd") !== "none" && role !== "DPO_EXTERNAL";
}

// Session invitations are a step further than the generic feature matrix
// can express: "planning: limited" for TRAINER means "their own sessions"
// per spec §2, which the flat PERMISSIONS table can't encode on its own —
// it needs the actual session's trainerId to check "own".
export function canManageSessionInvitations(
  role: Role,
  userId: string,
  session: { trainerId: string | null }
): boolean {
  if (role === "ADMIN_OF" || role === "ADMIN_MANAGER") return true;
  if (role === "TRAINER" && session.trainerId === userId) return true;
  return false;
}

// Same pattern as canManageSessionInvitations: "crm: limited" for SALES
// means "their own prospects" per spec §2, which needs the actual
// opportunity's ownerId, not just the role.
export function canManageOpportunity(role: Role, userId: string, opportunity: { ownerId: string | null }): boolean {
  if (role === "ADMIN_OF" || role === "ADMIN_MANAGER") return true;
  if (role === "SALES") return opportunity.ownerId === userId;
  return false;
}

// Gates the unified CRM contact record (spec request: click-through from a
// prospect to a merged CRM+Dossier view). Same "SALES limited to their own
// prospects" rule as canManageOpportunity, but a contact can have several
// opportunities — SALES needs to own at least one of them.
export function canAccessContact(role: Role, userId: string, opportunities: { ownerId: string | null }[]): boolean {
  if (role === "ADMIN_OF" || role === "ADMIN_MANAGER") return true;
  if (role === "SALES") return opportunities.some((o) => o.ownerId === userId);
  return false;
}

// AccommodationRequest holds RGPD art. 9 special-category data (situation
// de handicap) — deliberately not part of the general "dossiers" feature
// matrix. Restricted to admins plus whichever single person the org has
// designated as référent handicap (Organization.referentHandicapUserId),
// same as the RNQ indicator 20 requirement — not every TRAINER/SALES with
// normal dossier access should see this.
export function canAccessAccommodations(role: Role, userId: string, organization: { referentHandicapUserId: string | null }): boolean {
  if (role === "ADMIN_OF" || role === "ADMIN_MANAGER") return true;
  return organization.referentHandicapUserId === userId;
}

// Deliberately narrower than canAccessAccommodations — no per-org "referent"
// carve-out, since a harassment/discrimination report could be about the
// referent-equivalent person too. Submitting a report (see /support) is
// open to every role; only ADMIN_OF can ever read one back.
export function canAccessSecureReports(role: Role): boolean {
  return role === "ADMIN_OF";
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_OF: "Admin OF",
  ADMIN_MANAGER: "Responsable administratif",
  SALES: "Commercial",
  TRAINER: "Formateur",
  LEARNER: "Apprenant",
  DPO_EXTERNAL: "DPO externe",
};
