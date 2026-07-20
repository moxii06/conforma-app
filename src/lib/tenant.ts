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

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_OF: "Admin OF",
  ADMIN_MANAGER: "Responsable administratif",
  SALES: "Commercial",
  TRAINER: "Formateur",
  LEARNER: "Apprenant",
  DPO_EXTERNAL: "DPO externe",
};
