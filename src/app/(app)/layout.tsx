import { requireSessionContext, can, ROLE_LABELS } from "@/lib/tenant";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { NAV_GROUPS } from "@/components/navGroups";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// Every authenticated page lives under this route group so the auth
// check + Sidebar only need to exist in one place. requireSessionContext()
// redirects to /login on its own if there's no session — the middleware
// already does this too, but keeping the check here as well means this
// layout never renders content for a signed-out request even if the
// middleware matcher is ever loosened.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionContext();
  // Only fetched for learners — the one Sidebar actually uses it for (see
  // Sidebar's marque blanche comment) — no need for staff to pay this
  // query on every page load.
  const organization =
    session.role === Role.LEARNER
      ? await prisma.organization.findUnique({
          where: { id: session.organizationId },
          select: { name: true, logoUrl: true, brandColor: true },
        })
      : null;

  // Platform-owner-set access control (src/app/plateforme, src/lib/
  // platformAdmin.ts) — checked here rather than in middleware.ts because
  // Edge middleware can't run Prisma's Node engine. Every role goes through
  // this, including LEARNER: a suspended OF's learners lose access too,
  // not just staff.
  const access = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { suspendedAt: true, suspendedReason: true, accessWarningAt: true, accessWarningReason: true },
  });
  if (access?.suspendedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist p-4">
        <div className="bg-white border border-line rounded-card p-6 max-w-md text-center">
          <div className="text-[15px] font-semibold text-ink mb-1.5">Accès suspendu</div>
          <p className="text-[13px] text-slate leading-relaxed">
            L'accès de votre organisme à Jalon a été suspendu.
            {access.suspendedReason ? ` Motif : ${access.suspendedReason}.` : ""} Contactez-nous pour le rétablir.
          </p>
        </div>
      </div>
    );
  }

  // Permission filtering stays here (and in the Sidebar), so the mobile
  // drawer only ever receives feature keys that already passed the matrix —
  // it decides layout, never access.
  const allowedFeatures = NAV_GROUPS.flatMap((g) => g.items)
    .filter((item) => can(session.role, item.feature) !== "none")
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
        {access?.accessWarningAt && (
          <div className="bg-[#EDDFC6] text-seal-dark text-[12.5px] px-4 py-2 text-center shrink-0">
            Il y a un point à régler sur votre compte Jalon{access.accessWarningReason ? ` — ${access.accessWarningReason}` : ""} — contactez-nous.
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
