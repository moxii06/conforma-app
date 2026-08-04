import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

// A 30-day JWT session is only as revocable as this check makes it: with
// no server-side session store, a stolen token otherwise stays valid until
// it naturally expires — including through a "mot de passe oublié" the
// account owner triggers specifically because they suspect it's stolen.
// Comparing against a fresh DB read on every call is a real per-request
// cost, but it's the only way a JWT-strategy session can be revoked at
// all; see User.passwordChangedAt's schema comment for the full mechanism.
async function isSessionStale(userId: string, issuedAt: number | null | undefined): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordChangedAt: true } });
  if (!user?.passwordChangedAt) return false; // never reset — nothing to invalidate against
  const changedAt = user.passwordChangedAt.getTime();
  // `issuedAt` is undefined for tokens minted before this field existed —
  // those predate every real password change by definition, so only a
  // DB timestamp that's actually later than what the token carries (or a
  // token that carries nothing at all) counts as stale.
  return issuedAt == null || changedAt > issuedAt;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const { id, organizationId, role, name, email, passwordChangedAt } = session.user;
  if (!id || !organizationId || !role) return null;
  if (await isSessionStale(id, passwordChangedAt)) return null;
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
  courses: "Catalogue de formations",
  dossiers: "Dossiers apprenants",
  qualiopi: "Conformité Qualiopi",
  rgpd: "Registre RGPD",
  toolkit: "Toolkit documents",
  integrations: "Intégrations",
  team: "Équipe & rôles",
  billing: "Abonnement",
  automations: "Automatisations",
  inbox: "Boîte mail",
  bpf: "Bilan pédagogique et financier",
  portal: "Mon espace",
  faq: "FAQ & guides",
  support: "Réclamations & signalement",
  profile: "Mon profil",
};

// `satisfies` plutôt qu'une annotation `Record<string, …>` : l'annotation
// élargissait les clés à `string`, donc `can(role, "facturation")` — la
// clé s'appelle `invoicing` — compilait et renvoyait « none » en silence.
// Une route entière renvoyait 403 sans que rien ne le signale. Avec
// `satisfies`, la forme reste vérifiée (chaque entrée doit couvrir tous
// les rôles) mais les clés restent littérales, et une faute de frappe
// devient une erreur de compilation.
export const PERMISSIONS = {
  dashboard: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  crm: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "limited", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  invoicing: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  planning: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  // Split out of "planning" so a LEARNER can reach /formations — which for
  // them is "Mes formations", their own enrolled courses — without that also
  // granting /planning, where they could read every session of the whole
  // organisation (and every course title through the global search, see
  // /api/search). Same reasoning as the "automations" key below: a distinct
  // key rather than a role carve-out inside the pages, so the matrix stays
  // the one place access is decided.
  courses: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "limited", DPO_EXTERNAL: "none" },
  dossiers: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  // TRAINER passé de "limited" à "none" : la conformité Qualiopi est la
  // responsabilité de l'organisme, pas de l'intervenant. Et un sous-traitant
  // invité se connecte AVEC CE RÔLE (voir /api/subcontractors/[id]/invite) —
  // lui ouvrir l'espace Qualiopi, c'est lui montrer les non-conformités, le
  // registre des risques et les résultats d'audit d'une structure qui n'est
  // pas la sienne, et sur laquelle il est parfois lui-même évalué.
  qualiopi: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  rgpd: { ADMIN_OF: "full", ADMIN_MANAGER: "limited", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "limited" },
  toolkit: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "limited", TRAINER: "limited", LEARNER: "none", DPO_EXTERNAL: "none" },
  integrations: { ADMIN_OF: "full", ADMIN_MANAGER: "none", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  team: { ADMIN_OF: "full", ADMIN_MANAGER: "none", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  // /abonnement already gated itself with a bare `role !== ADMIN_OF` check,
  // outside this matrix — which is why it had no sidebar entry and became
  // unreachable the moment the trial banner (its only link) stopped
  // rendering. Same owner-only audience, expressed here so the nav and the
  // page agree instead of each deciding on its own.
  billing: { ADMIN_OF: "full", ADMIN_MANAGER: "none", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
  // Same audience as "planning: full" (the only roles that can already
  // configure a course's automation rules from /formations/[id]) — a
  // distinct key rather than reusing "planning" so the sidebar doesn't
  // show this to SALES/TRAINER, who have "limited" planning access and
  // would just hit the redirect.
  automations: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "none", TRAINER: "none", LEARNER: "none", DPO_EXTERNAL: "none" },
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
  // /profil n'avait aucune entrée de navigation : on y accédait uniquement en
  // cliquant son propre nom dans la barre latérale. Or c'est là que vivent la
  // forme juridique, le RCS et le n° de déclaration d'activité — qui
  // alimentent TOUTES les conventions générées. La première étape du
  // démarrage était la plus cachée de l'application.
  profile: { ADMIN_OF: "full", ADMIN_MANAGER: "full", SALES: "full", TRAINER: "full", LEARNER: "full", DPO_EXTERNAL: "full" },
} satisfies Record<string, Record<Role, AccessLevel>>;

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
