import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { AUTOMATION_TRIGGER_VALUES } from "@/lib/automationRules";

const schema = z
  .object({
    trigger: z.enum(AUTOMATION_TRIGGER_VALUES),
    afterDays: z.number().int().positive(),
    sendEmail: z.boolean().optional(),
    emailSubject: z.string().optional(),
    emailBody: z.string().optional(),
  })
  // The email dialog is written once at rule creation — if staff opt into
  // sending it automatically, a subject/body must actually exist to fill in
  // and send; a task-only rule doesn't need either.
  .refine((data) => !data.sendEmail || (data.emailSubject?.trim() && data.emailBody?.trim()), {
    message: "L'objet et le corps de l'email sont requis pour une relance avec envoi automatique.",
  });

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
      trigger: parsed.data.trigger,
      afterDays: parsed.data.afterDays,
      sendEmail: parsed.data.sendEmail ?? false,
      emailSubject: parsed.data.emailSubject?.trim() || null,
      emailBody: parsed.data.emailBody?.trim() || null,
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
