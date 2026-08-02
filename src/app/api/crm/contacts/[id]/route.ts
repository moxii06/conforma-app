import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { applyCompanyInfo, enrollmentCategorySchema } from "@/lib/enrollment";

const schema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    urgencyLevel: z.enum(["low", "medium", "high"]).nullable().optional(),
    emailConsent: z.boolean().nullable().optional(),
    smsConsent: z.boolean().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .merge(enrollmentCategorySchema);

// Client feedback: the contact record's own name/email/phone need to be
// editable and kept accurate, since they feed the merge-tag engine
// (Prénom/Nom/...) used across every document/email personalization —
// same reasoning as EditCompanyForm for the company side.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.email && parsed.data.email.toLowerCase() !== contact.email) {
    const existing = await prisma.contact.findFirst({
      where: { organizationId: session.organizationId, email: parsed.data.email.toLowerCase(), NOT: { id: contact.id } },
    });
    if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé par un autre contact." }, { status: 409 });
  }

  if (parsed.data.company) {
    await applyCompanyInfo(session.organizationId, contact.id, parsed.data.company);
  }

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email?.toLowerCase(),
      phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null,
      address: parsed.data.address === undefined ? undefined : parsed.data.address || null,
      defaultLearnerCategory: parsed.data.learnerCategory,
      industry: parsed.data.industry === undefined ? undefined : parsed.data.industry || null,
      urgencyLevel: parsed.data.urgencyLevel,
      notes: parsed.data.notes === undefined ? undefined : parsed.data.notes || null,
      // Both true and false are a real recorded answer worth timestamping;
      // only explicitly clearing back to null (never asked) drops the date.
      ...(parsed.data.emailConsent === undefined
        ? {}
        : { emailConsent: parsed.data.emailConsent, emailConsentAt: parsed.data.emailConsent === null ? null : new Date() }),
      ...(parsed.data.smsConsent === undefined
        ? {}
        : { smsConsent: parsed.data.smsConsent, smsConsentAt: parsed.data.smsConsent === null ? null : new Date() }),
    },
  });

  return NextResponse.json(updated);
}
