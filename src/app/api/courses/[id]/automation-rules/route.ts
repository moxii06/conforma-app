import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  afterDays: z.number().int().positive(),
  sendEmail: z.boolean().optional(),
});

// Only one trigger kind exists today (needs_assessment_incomplete) — hardcoded
// server-side rather than accepted from the client, so a bad payload can't
// create a rule the rest of the app doesn't know how to evaluate.
const TRIGGER = "needs_assessment_incomplete";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const course = await prisma.course.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const rule = await prisma.automationRule.create({
    data: {
      organizationId: session.organizationId,
      courseId: course.id,
      trigger: TRIGGER,
      afterDays: parsed.data.afterDays,
      sendEmail: parsed.data.sendEmail ?? false,
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
