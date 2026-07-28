import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, parsePaging } from "@/lib/apiAuth";

// GET /api/v1/dossiers — enrollments and how far along they are.
//
// The most-requested resource: it is what an OF pushes into a spreadsheet or
// a BI tool. Field names here are a public contract from now on — renaming
// one breaks every integration built on it, so they are snake_case and
// deliberately decoupled from the Prisma column names.
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:dossiers");
  if ("error" in auth) return auth.error;
  const { take, skip } = parsePaging(request);

  const [total, dossiers] = await Promise.all([
    prisma.dossier.count({ where: { organizationId: auth.context.organizationId } }),
    prisma.dossier.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        session: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            mode: true,
            format: true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    data: dossiers.map((d) => ({
      id: d.id,
      created_at: d.createdAt.toISOString(),
      learner: {
        id: d.contact.id,
        first_name: d.contact.firstName,
        last_name: d.contact.lastName,
        email: d.contact.email,
      },
      course: { id: d.session.course.id, title: d.session.course.title },
      session: {
        id: d.session.id,
        mode: d.session.mode,
        format: d.session.format,
        starts_at: d.session.startsAt.toISOString(),
        ends_at: d.session.endsAt.toISOString(),
      },
      // The Parcours checklist, flattened — this is what integrations
      // actually filter on.
      progress: {
        needs_assessment_done: d.needsAssessmentDone,
        contract_signed: d.contractSigned,
        convocation_sent: d.convocationSent,
        evaluation_hot_done: d.evaluationHotDone,
        evaluation_cold_done: d.evaluationColdDone,
      },
      learner_category: d.learnerCategory,
    })),
    pagination: { total, limit: take, offset: skip },
  });
}
