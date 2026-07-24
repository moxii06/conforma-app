import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { buildOrgChartGroups } from "@/lib/orgChart";
import { Role } from "@prisma/client";

export async function POST() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const [members, subcontractors] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.organizationId, role: { not: Role.LEARNER } },
      select: { id: true, name: true, role: true },
    }),
    prisma.subcontractor.findMany({
      where: { organizationId: session.organizationId },
      select: { id: true, name: true, type: true },
    }),
  ]);

  const groups = buildOrgChartGroups(members, subcontractors);

  const snapshot = await prisma.orgChartSnapshot.create({
    data: {
      organizationId: session.organizationId,
      createdByName: session.name || session.email,
      data: groups,
    },
  });

  return NextResponse.json(snapshot, { status: 201 });
}
