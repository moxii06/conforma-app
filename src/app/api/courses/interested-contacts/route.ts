import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Client feedback: "quand je crée une formation, dans les apprenants
// existants, ça trouve automatiquement des apprenants renseignés dans mon
// CRM comme participants à la formation" — surfaces contacts who already
// have a CRM opportunity pointing at this training, so staff don't have to
// remember and re-search for them by name.
//
// Two matching modes, both optional and combinable:
// - courseId: exact match via Opportunity.courseOfInterestId — reliable,
//   only possible once the course exists (same relation the Planning
//   autosuggest already relies on, see planning/[id]/page.tsx).
// - q: case-insensitive substring match on Opportunity.label — the only
//   signal available while a course is still being created (no id yet to
//   match against), since label is the free-text course name the sales
//   rep typed when logging the prospect's interest.
export async function GET(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId")?.trim() || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  if (!courseId && (!q || q.length < 2)) return NextResponse.json([]);

  const alreadyEnrolledContactIds = courseId
    ? (
        await prisma.dossier.findMany({
          where: { organizationId: auth.organizationId, session: { courseId } },
          select: { contactId: true },
        })
      ).map((d) => d.contactId)
    : [];

  const opportunities = await prisma.opportunity.findMany({
    where: {
      organizationId: auth.organizationId,
      contactId: { notIn: alreadyEnrolledContactIds },
      OR: [
        ...(courseId ? [{ courseOfInterestId: courseId }] : []),
        ...(q ? [{ label: { contains: q, mode: "insensitive" as const } }] : []),
      ],
    },
    include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const byContact = new Map<string, { id: string; firstName: string; lastName: string; email: string; matchedLabel: string }>();
  for (const o of opportunities) {
    if (!byContact.has(o.contact.id)) {
      byContact.set(o.contact.id, { ...o.contact, matchedLabel: o.label });
    }
  }

  return NextResponse.json(Array.from(byContact.values()));
}
