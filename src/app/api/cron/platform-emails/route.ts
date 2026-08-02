import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCronRequest } from "@/lib/cronAuth";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";

// Envoie les PlatformEmailMessage dont l'échéance est passée (ou immédiate,
// au cas où l'envoi synchrone déclenché par la fiche organisme aurait
// échoué — même condition, donc même filet de sécurité). Résolution à la
// journée, pas à la minute : cohérent avec le reste des crons de cette app
// (voir vercel.json), suffisant pour des communications ponctuelles.
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;

  if (!isBrevoConfigured()) return NextResponse.json({ sent: 0, reason: "Brevo non configuré." });

  const due = await prisma.platformEmailMessage.findMany({
    where: { sentAt: null, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
  });

  let sent = 0;
  for (const message of due) {
    try {
      await sendTransactionalEmail({
        to: message.toEmail,
        subject: message.subject,
        text: message.body,
        senderName: "Jalon",
      });
      await prisma.platformEmailMessage.update({ where: { id: message.id }, data: { sentAt: new Date() } });
      sent++;
    } catch {
      // Laissé pour le prochain passage — pas de compteur d'essais, ce
      // volume ne le justifie pas (voir le commentaire équivalent dans
      // onboardingEmails.ts pour la même logique appliquée ailleurs).
    }
  }

  return NextResponse.json({ sent, found: due.length });
}
