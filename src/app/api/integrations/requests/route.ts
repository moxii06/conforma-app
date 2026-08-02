import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";
import { platformContactEmail } from "@/lib/platformAdmin";

const schema = z.object({
  toolName: z.string().min(2).max(120),
  useCase: z.string().min(10).max(2000),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Same gate as the rest of /integrations — connecting tools is an ADMIN_OF
  // decision, and so is asking for a new one.
  if (can(session.role, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Indiquez le nom de l'outil et décrivez votre besoin en quelques mots." },
      { status: 400 },
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { name: true },
  });

  // Persist first, notify second. The row is the record; the email is only
  // how the Jalon team finds out. If the send fails the request must still
  // exist — losing it would be invisible to everyone, including the OF who
  // would reasonably assume it went through.
  const created = await prisma.integrationRequest.create({
    data: {
      organizationId: session.organizationId,
      requestedByUserId: session.userId,
      requestedByName: session.name || session.email,
      requestedByEmail: session.email,
      toolName: parsed.data.toolName.trim(),
      useCase: parsed.data.useCase.trim(),
    },
  });

  let notified = false;
  const recipient = platformContactEmail();
  if (recipient && isBrevoConfigured()) {
    try {
      const orgName = organization?.name ?? session.organizationId;
      await sendTransactionalEmail({
        to: recipient,
        toName: "Équipe Jalon",
        senderName: "Jalon",
        subject: `Demande d'intégration : ${created.toolName}`,
        text: [
          `Organisme : ${orgName}`,
          `Demandé par : ${created.requestedByName} (${created.requestedByEmail})`,
          `Outil : ${created.toolName}`,
          "",
          "Besoin :",
          created.useCase,
        ].join("\n"),
        // replyTo on the requester so answering the notification reaches the
        // person who asked, not Jalon's own sending address.
        replyTo: created.requestedByEmail,
      });
      notified = true;
    } catch {
      // Swallowed on purpose: the request is already saved, and telling the
      // OF "your request failed" would be false. The UI reports it as
      // received either way.
      notified = false;
    }
  }

  return NextResponse.json({ ...created, notified }, { status: 201 });
}
