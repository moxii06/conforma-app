import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionContext, can } from "@/lib/tenant";

// Global search (Cmd/Ctrl+K) — deliberately narrow to the two entities with
// an actual proper name people type: contacts and course titles. Sessions
// and dossiers don't have a name of their own (a session is "a course on a
// date", a dossier is "a contact in a session") — they're reached by
// drilling into a contact or a course instead of being duplicated here.
// Ownership scoping mirrors the exact filters already used on /crm and
// /formations, so a role never sees more here than it would on the full page.
export async function GET(req: Request) {
  const { organizationId, role, userId } = await requireSessionContext();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ contacts: [], courses: [] });

  const [contacts, courses] = await Promise.all([
    can(role, "crm") !== "none"
      ? prisma.contact.findMany({
          where: {
            organizationId,
            ...(role === Role.SALES ? { opportunities: { some: { ownerId: userId } } } : {}),
            AND: [
              {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q, mode: "insensitive" } },
                ],
              },
            ],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            dossiers: { select: { id: true }, orderBy: { session: { startsAt: "desc" } }, take: 1 },
          },
          take: 6,
        })
      : Promise.resolve([]),
    can(role, "planning") !== "none"
      ? prisma.course.findMany({
          where: {
            organizationId,
            ...(role === Role.TRAINER
              ? {
                  OR: [
                    { sessions: { some: { trainerId: userId } } },
                    { subcontractors: { some: { linkedUserId: userId } } },
                    { responsibleUsers: { some: { id: userId } } },
                  ],
                }
              : {}),
            AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }],
          },
          select: { id: true, title: true },
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      sub: c.email,
      href: c.dossiers.length > 0 ? `/dossiers/${c.dossiers[0].id}` : `/crm/contacts/${c.id}`,
    })),
    courses: courses.map((c) => ({ id: c.id, label: c.title, href: `/formations/${c.id}` })),
  });
}
