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
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
