import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, parsePaging } from "@/lib/apiAuth";

// GET /api/v1/courses — the catalogue.
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:courses");
  if ("error" in auth) return auth.error;
  const { take, skip } = parsePaging(request);

  const [total, courses] = await Promise.all([
    prisma.course.count({ where: { organizationId: auth.context.organizationId } }),
    prisma.course.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: { title: "asc" },
      take,
      skip,
    }),
  ]);

  return NextResponse.json({
    data: courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      duration_hours: c.durationHours,
      price_cents: c.priceCents,
      prerequisites: c.prerequisites,
      objectives: c.objectives,
      is_public: c.isPublic,
      // Exposed as a boolean rather than a nullable date: consumers care
      // whether it is still sellable, not when it was retired.
      archived: c.archivedAt !== null,
    })),
    pagination: { total, limit: take, offset: skip },
  });
}
