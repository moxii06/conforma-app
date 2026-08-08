import type { Metadata } from "next";
import { requireSessionContext, getSessionContext, can, ROLE_LABELS } from "@/lib/tenant";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { NAV_GROUPS } from "@/components/navGroups";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// Every page under (app)/ inherits this unless it sets its own metadata —
// for a LEARNER that means the browser tab, history and any shared
// screenshot say "Jalon" regardless of the org's white-label identity
// everywhere else in the chrome (Sidebar/MobileNav already get this right).
// getSessionContext() (not requireSessionContext()) on purpose: metadata
// generation isn't the place to redirect on a missing session — the layout
// body below still does that, this just degrades to the generic title.
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSessionContext();
  if (session?.role === Role.LEARNER) {
    const organization = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true },
    });
    if (organization) return { title: organization.name };
  }
  return { title: "Jalon" };
}

// Every authenticated page lives under this route group so the auth
// check + Sidebar only need to exist in one place. requireSessionContext()
// redirects to /login on its own if there's no session — the middleware
// already does this too, but keeping the check here as well means this
// layout never renders content for a signed-out request even if the
// middleware matcher is ever loosened.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionContext();
  // Single query for both concerns below (used to be two separate
  // findUnique calls against the same row). Fetched for every role, not
  // just LEARNER: the suspension/warning messages need to render without
  // naming "Jalon" regardless of who's looking, and the org's own identity
  // is the only thing that can stand in for it — see the two message
  // strings below, which deliberately name neither Jalon nor the org.
  const organization = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: {
      name: true,
      logoUrl: true,
      brandColor: true,
      suspendedAt: true,
      suspendedReason: true,
      accessWarningAt: true,
      accessWarningReason: true,
    },
  });

  // Platform-owner-set access control (src/app/plateforme, src/lib/
  // platformAdmin.ts) — checked here rather than in middleware.ts because
  // Edge middleware can't run Prisma's Node engine. Every role goes through
  // this, including LEARNER: a suspended OF's learners lose access too,
  // not just staff. Neither message below names "Jalon" — a learner reading
  // it should never learn their OF runs on a third-party platform, and
  // "your org's access to Jalon" would also expose an internal billing
  // dispute to someone who has no part in it.
  if (organization?.suspendedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist p-4">
        <div className="bg-white border border-line rounded-card p-6 max-w-md text-center">
          <div className="text-[15px] font-semibold text-ink mb-1.5">Accès suspendu</div>
          <p className="text-[13px] text-slate leading-relaxed">
            L'accès de votre organisme à cet espace a été suspendu.
            {organization.suspendedReason ? ` Motif : ${organization.suspendedReason}.` : ""} Contactez-nous pour le rétablir.
          </p>
        </div>
      </div>
    );
  }

  // Permission filtering stays here (and in the Sidebar), so the mobile
  // drawer only ever receives feature keys that already passed the matrix —
  // it decides layout, never access.
  const allowedFeatures = NAV_GROUPS.flatMap((g) => g.items)
    .filter((item) => can(session.roles, item.feature) !== "none")
    .map((item) => item.feature);

  return (
    <div className="flex h-screen">
      <Sidebar user={session} organization={organization ?? undefined} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav
          allowedFeatures={allowedFeatures}
          brandName={session.role === Role.LEARNER && organization ? organization.name : "Jalon"}
          userLabel={session.name || session.email}
          roleLabel={ROLE_LABELS[session.role]}
        />
        {organization?.accessWarningAt && (
          <div className="bg-[#EDDFC6] text-seal-dark text-[12.5px] px-4 py-2 text-center shrink-0">
            Il y a un point à régler sur votre compte{organization.accessWarningReason ? ` — ${organization.accessWarningReason}` : ""} — contactez-nous.
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
