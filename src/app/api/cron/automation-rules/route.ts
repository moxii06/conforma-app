import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";

// Runs daily (see vercel.json) to act on AutomationRules with sendEmail
// enabled — the task-only part of a rule is computed live by
// getDashboardTasks and needs nothing here. Requires CRON_SECRET to be set
// (Vercel sends it as `Authorization: Bearer <CRON_SECRET>` automatically
// once the env var exists); until then this route is unreachable in
// production, same "prepared but not yet wired" stance as the other
// stubbed integrations (see /integrations).
export async function GET(request: Request) {
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rules = await prisma.automationRule.findMany({
    where: { active: true, sendEmail: true, trigger: "needs_assessment_incomplete" },
    include: { organization: true },
  });

  let sent = 0;
  for (const rule of rules) {
    const threshold = addDays(new Date(), -rule.afterDays);
    const dossiers = await prisma.dossier.findMany({
      where: {
        organizationId: rule.organizationId,
        needsAssessmentDone: false,
        needsAssessmentAutoReminderSentAt: null,
        createdAt: { lte: threshold },
        session: { courseId: rule.courseId },
      },
      include: { contact: true },
    });

    for (const d of dossiers) {
      try {
        await sendTransactionalEmail({
          to: d.contact.email,
          toName: `${d.contact.firstName} ${d.contact.lastName}`,
          subject: `${rule.organization.name} — rappel : recueil des besoins`,
          text: `Bonjour ${d.contact.firstName},\n\nNous n'avons pas encore reçu votre recueil des besoins pour votre formation. Merci de contacter votre organisme de formation pour le compléter.\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
          senderName: rule.organization.name,
        });
      } catch {
        // Non-fatal — still mark it stamped below so a persistently failing
        // address doesn't retry forever; staff can still see it via the
        // dashboard task and relay manually.
      }
      await prisma.$transaction([
        prisma.dossier.update({ where: { id: d.id }, data: { needsAssessmentAutoReminderSentAt: new Date() } }),
        prisma.clientOutreach.create({
          data: {
            organizationId: rule.organizationId,
            contactId: d.contactId,
            dossierId: d.id,
            type: "needs_assessment_reminder",
            sentByUserId: "system",
            sentByName: "Automatisation (règle formation)",
          },
        }),
      ]);
      sent++;
    }
  }

  return NextResponse.json({ sent });
}
