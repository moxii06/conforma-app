import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";

/**
 * Envoie les PlatformEmailMessage dont l'échéance est passée (ou immédiate,
 * au cas où l'envoi synchrone déclenché par la fiche organisme aurait
 * échoué — même condition, donc même filet de sécurité). Résolution à la
 * journée, pas à la minute : suffisant pour des communications ponctuelles.
 *
 * Extrait de son ancienne route /api/cron/platform-emails pour devenir une
 * étape de la chaîne quotidienne. La raison est arithmétique : le forfait
 * Vercel Hobby n'autorise que 2 tâches planifiées, et vercel.json en
 * déclarait 3. L'audit de tenue en charge n'a pas pu déterminer laquelle
 * des trois n'était pas enregistrée — donc laquelle ne tournait pas. Une
 * troisième étape dans une chaîne qui existe déjà supprime la question.
 */
export async function sendDuePlatformEmails() {
  if (!isBrevoConfigured()) return { sent: 0, found: 0, reason: "Brevo non configuré." };

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

  return { sent, found: due.length };
}
