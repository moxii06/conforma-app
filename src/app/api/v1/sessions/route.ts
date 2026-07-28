import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, parsePaging } from "@/lib/apiAuth";

// GET /api/v1/sessions — scheduled sessions, with how many learners are on
// each. enrolled_count is counted server-side so nobody has to cross-join
// dossiers to answer "is this session full".
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:sessions");
  if ("error" in auth) return auth.error;
  const { take, skip } = parsePaging(request);

  const [total, sessions] = await Promise.all([
    prisma.session.count({ where: { organizationId: auth.context.organizationId } }),
    prisma.session.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: { startsAt: "desc" },
      take,
      skip,
      include: {
        course: { select: { id: true, title: true } },
        trainer: { select: { id: true, name: true } },
        _count: { select: { dossiers: true } },
      },
    }),
  ]);

  return NextResponse.json({
    data: sessions.map((s) => ({
      id: s.id,
      course: { id: s.course.id, title: s.course.title },
      mode: s.mode,
      format: s.format,
      status: s.status,
      starts_at: s.startsAt.toISOString(),
      ends_at: s.endsAt.toISOString(),
      location: s.location,
      capacity: s.capacity,
      enrolled_count: s._count.dossiers,
      trainer: s.trainer ? { id: s.trainer.id, name: s.trainer.name } : null,
    })),
    pagination: { total, limit: take, offset: skip },
  });
}
