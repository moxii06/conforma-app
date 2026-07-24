import { NextResponse } from "next/server";
import { z } from "zod";
import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { applyCompanyInfo, enrollmentCategorySchema } from "@/lib/enrollment";

const schema = z.discriminatedUnion("contactMode", [
  z
    .object({
      contactMode: z.literal("existing"),
      contactId: z.string().min(1),
      label: z.string().min(1),
      amountCents: z.number().int().positive().optional(),
      courseOfInterestId: z.string().optional(),
    })
    .merge(enrollmentCategorySchema),
  z
    .object({
      contactMode: z.literal("new"),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      label: z.string().min(1),
      amountCents: z.number().int().positive().optional(),
      courseOfInterestId: z.string().optional(),
    })
    .merge(enrollmentCategorySchema),
]);

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  let contactId: string;
  if (data.contactMode === "existing") {
    const contact = await prisma.contact.findFirst({
      where: { id: data.contactId, organizationId: session.organizationId },
    });
    if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    contactId = contact.id;
    if (data.learnerCategory) {
      await prisma.contact.update({ where: { id: contactId }, data: { defaultLearnerCategory: data.learnerCategory } });
    }
  } else {
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.contact.findFirst({
      where: { organizationId: session.organizationId, email },
    });
    if (existing) {
      contactId = existing.id;
      if (data.learnerCategory) {
        await prisma.contact.update({ where: { id: contactId }, data: { defaultLearnerCategory: data.learnerCategory } });
      }
    } else {
      const created = await prisma.contact.create({
        data: {
          organizationId: session.organizationId,
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          phone: data.phone,
          defaultLearnerCategory: data.learnerCategory || null,
        },
      });
      contactId = created.id;
    }
  }

  if (data.company) {
    await applyCompanyInfo(session.organizationId, contactId, data.company);
  }

  let courseOfInterestId: string | undefined;
  if (data.courseOfInterestId) {
    const course = await prisma.course.findFirst({
      where: { id: data.courseOfInterestId, organizationId: session.organizationId },
    });
    if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
    courseOfInterestId = course.id;
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      organizationId: session.organizationId,
      contactId,
      label: data.label,
      amountCents: data.amountCents,
      stage: PipelineStage.PROSPECT,
      ownerId: session.userId,
      courseOfInterestId,
    },
    include: { contact: true },
  });

  return NextResponse.json(opportunity, { status: 201 });
}
