import { requireSessionContext } from "@/lib/tenant";
import { Sidebar } from "@/components/Sidebar";
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

  return (
    <div className="flex h-screen">
      <Sidebar user={session} organization={organization ?? undefined} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
