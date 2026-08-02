import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";

const schema = z.object({
  toEmail: z.string().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  // Absent/vide = envoi immédiat. Renseigné = laissé au cron
  // /api/cron/platform-emails, qui envoie tout ce dont l'échéance est passée.
  scheduledAt: z.string().optional(),
});

// La ligne est TOUJOURS créée, envoyée ou non — c'est elle qui alimente
// l'historique affiché sur la fiche organisme, y compris ce qui est encore
// en attente. Un envoi immédiat qui échoue n'est pas perdu : sentAt reste
// null, et le prochain passage du cron le retentera (même condition que
// "programmé pour une date passée").
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const params = await props.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Champs invalides.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });

  let scheduledAt: Date | null = null;
  if (parsed.data.scheduledAt) {
    scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const message = await prisma.platformEmailMessage.create({
    data: {
      organizationId: organization.id,
      toEmail: parsed.data.toEmail,
      subject: parsed.data.subject,
      body: parsed.data.body,
      scheduledAt,
    },
  });

  const isDue = !scheduledAt || scheduledAt.getTime() <= Date.now();
  if (isDue && isBrevoConfigured()) {
    try {
      await sendTransactionalEmail({
        to: message.toEmail,
        subject: message.subject,
        text: message.body,
        senderName: "Jalon",
      });
      await prisma.platformEmailMessage.update({ where: { id: message.id }, data: { sentAt: new Date() } });
    } catch {
      // sentAt reste null — le cron retentera. La ligne existe déjà, rien
      // n'est perdu pour l'historique.
    }
  }

  const updated = await prisma.platformEmailMessage.findUniqueOrThrow({ where: { id: message.id } });
  return NextResponse.json(updated, { status: 201 });
}
