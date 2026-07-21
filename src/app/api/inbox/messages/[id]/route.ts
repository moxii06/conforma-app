import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), contactId: z.string().min(1) }),
  z.object({
    action: z.literal("link-new"),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().optional(),
    companyName: z.string().optional(),
  }),
  z.object({ action: z.literal("discard") }),
  z.object({ action: z.literal("assign"), userId: z.string().min(1).nullable() }),
]);

// Manual triage actions on one unsorted inbox message — spec §5.11 point 4:
// staff can create a new prospect, manually link to an existing contact, or
// discard. Point 5 (auto-purge unsorted messages after ~30 days) isn't
// implemented — there's no scheduled job runner in this scaffold; a real
// deployment needs a cron/worker to sweep `EmailMessage` rows with
// `contactId: null` past the retention window.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Action invalide." }, { status: 400 });

  if (parsed.data.action === "discard") {
    await prisma.emailMessage.delete({ where: { id: message.id } });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "assign") {
    if (parsed.data.userId === null) {
      const updated = await prisma.emailMessage.update({
        where: { id: message.id },
        data: { assignedToUserId: null, assignedToName: null },
      });
      return NextResponse.json(updated);
    }
    const member = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: session.organizationId },
    });
    if (!member) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    const updated = await prisma.emailMessage.update({
      where: { id: message.id },
      data: { assignedToUserId: member.id, assignedToName: member.name },
    });
    return NextResponse.json(updated);
  }

  let contactId: string;
  if (parsed.data.action === "link") {
    const contact = await prisma.contact.findFirst({
      where: { id: parsed.data.contactId, organizationId: session.organizationId },
    });
    if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    contactId = contact.id;
  } else {
    const existing = await prisma.contact.findFirst({
      where: { organizationId: session.organizationId, email: message.fromAddress.toLowerCase() },
    });
    if (existing) {
      contactId = existing.id;
    } else {
      let companyId: string | undefined;
      if (parsed.data.companyName?.trim()) {
        const companyName = parsed.data.companyName.trim();
        const company =
          (await prisma.company.findFirst({ where: { organizationId: session.organizationId, name: companyName } })) ??
          (await prisma.company.create({ data: { organizationId: session.organizationId, name: companyName } }));
        companyId = company.id;
      }
      const created = await prisma.contact.create({
        data: {
          organizationId: session.organizationId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: message.fromAddress.toLowerCase(),
          phone: parsed.data.phone?.trim() || undefined,
          companyId,
        },
      });
      contactId = created.id;
    }
  }

  const updated = await prisma.emailMessage.update({
    where: { id: message.id },
    data: { contactId, matchBasis: null, suggestedDossierId: null },
  });

  return NextResponse.json(updated);
}
