import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import { createSessionInvitation } from "@/lib/sessionInvitations";
import { fillMergeTags, type MergeTagContext } from "@/lib/automationRules";
import { getCourseCompletion } from "@/lib/lms";
import type { Contact, Course, Session, Organization } from "@prisma/client";

function mergeContext(contact: Contact, course: Course, session: Session, organization: Organization): MergeTagContext {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    courseTitle: course.title,
    sessionDateLabel:
      session.mode === "ROLLING"
        ? "formation en continu"
        : session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    organizationName: organization.name,
  };
}

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
    where: { active: true, sendEmail: true },
    include: { organization: true, course: true },
  });

  let sent = 0;
  for (const rule of rules) {
    if (rule.trigger === "needs_assessment_incomplete") {
      sent += await sendGenericReminder(rule, {
        where: { needsAssessmentDone: false, needsAssessmentAutoReminderSentAt: null },
        stampField: "needsAssessmentAutoReminderSentAt",
        outreachType: "needs_assessment_reminder",
        fallbackSubject: `${rule.organization.name} — rappel : recueil des besoins`,
        fallbackBody: (c) =>
          `Bonjour ${c.contact.firstName},\n\nNous n'avons pas encore reçu votre recueil des besoins pour votre formation. Merci de contacter votre organisme de formation pour le compléter.\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
      });
    } else if (rule.trigger === "contract_not_signed") {
      sent += await sendGenericReminder(rule, {
        where: { contractSigned: false, contractAutoReminderSentAt: null },
        stampField: "contractAutoReminderSentAt",
        outreachType: "contract_reminder",
        fallbackSubject: `${rule.organization.name} — rappel : convention à signer`,
        fallbackBody: (c) =>
          `Bonjour ${c.contact.firstName},\n\nNous n'avons pas encore reçu votre convention signée. Merci de nous la retourner rapidement.\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
      });
    } else if (rule.trigger === "convocation_missing") {
      sent += await sendConvocations(rule);
    } else if (rule.trigger === "rolling_duration_expiring") {
      sent += await sendRollingDurationReminders(rule);
    } else if (rule.trigger === "satisfaction_not_collected") {
      sent += await sendSatisfactionReminders(rule);
    }
  }

  return NextResponse.json({ sent });
}

type Rule = Awaited<ReturnType<typeof prisma.automationRule.findMany>>[number] & { organization: Organization; course: Course };

async function sendGenericReminder(
  rule: Rule,
  opts: {
    where: Record<string, unknown>;
    stampField: "needsAssessmentAutoReminderSentAt" | "contractAutoReminderSentAt";
    outreachType: string;
    fallbackSubject: string;
    fallbackBody: (ctx: { contact: Contact }) => string;
  }
) {
  const threshold = addDays(new Date(), -rule.afterDays);
  const dossiers = await prisma.dossier.findMany({
    where: { organizationId: rule.organizationId, ...opts.where, createdAt: { lte: threshold }, session: { courseId: rule.courseId } },
    include: { contact: true, session: true },
  });

  let sent = 0;
  for (const d of dossiers) {
    const ctx = mergeContext(d.contact, rule.course, d.session, rule.organization);
    try {
      await sendTransactionalEmail({
        to: d.contact.email,
        toName: `${d.contact.firstName} ${d.contact.lastName}`,
        subject: rule.emailSubject ? fillMergeTags(rule.emailSubject, ctx) : opts.fallbackSubject,
        text: rule.emailBody ? fillMergeTags(rule.emailBody, ctx) : opts.fallbackBody({ contact: d.contact }),
        senderName: rule.organization.name,
      });
    } catch {
      // Non-fatal — still stamp below so a persistently failing address
      // doesn't retry forever; staff can still see it via the dashboard
      // task and relay manually.
    }
    await prisma.$transaction([
      prisma.dossier.update({ where: { id: d.id }, data: { [opts.stampField]: new Date() } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: rule.organizationId,
          contactId: d.contactId,
          dossierId: d.id,
          type: opts.outreachType,
          sentByUserId: "system",
          sentByName: "Automatisation (règle formation)",
        },
      }),
    ]);
    sent++;
  }
  return sent;
}

// convocationSent (set by createSessionInvitation itself) is already this
// trigger's idempotency guard — no separate *SentAt field needed.
async function sendConvocations(rule: Rule) {
  const soon = addDays(new Date(), rule.afterDays);
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: rule.organizationId,
      convocationSent: false,
      session: { courseId: rule.courseId, startsAt: { gte: new Date(), lte: soon } },
    },
    include: { contact: true, session: true },
  });

  let sent = 0;
  for (const d of dossiers) {
    const ctx = mergeContext(d.contact, rule.course, d.session, rule.organization);
    try {
      await createSessionInvitation({
        session: d.session,
        dossier: d,
        sentByUserId: "system",
        sentByName: "Automatisation (règle formation)",
        subject: rule.emailSubject ? fillMergeTags(rule.emailSubject, ctx) : undefined,
        body: rule.emailBody ? fillMergeTags(rule.emailBody, ctx) : undefined,
      });
      sent++;
    } catch {
      // Non-fatal — dossier stays flagged in the dashboard task for manual send.
    }
  }
  return sent;
}

async function sendRollingDurationReminders(rule: Rule) {
  const now = new Date();
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: rule.organizationId,
      accessDurationDays: { not: null },
      firstAccessedAt: { not: null },
      rollingDurationAutoReminderSentAt: null,
      session: { courseId: rule.courseId, mode: "ROLLING" },
    },
    include: {
      contact: true,
      session: { include: { course: { include: { elearningModules: { include: { quiz: true } } } } } },
      elearningProgress: true,
      quizAttempts: true,
    },
  });

  let sent = 0;
  for (const d of dossiers) {
    const modules = d.session.course.elearningModules;
    if (modules.length === 0) continue;
    const { allCompleted } = getCourseCompletion(modules, d.elearningProgress, d.quizAttempts);
    if (allCompleted) continue;

    const deadline = addDays(d.firstAccessedAt!, d.accessDurationDays!);
    if (now < addDays(deadline, -rule.afterDays)) continue;

    const ctx = mergeContext(d.contact, rule.course, d.session, rule.organization);
    try {
      await sendTransactionalEmail({
        to: d.contact.email,
        toName: `${d.contact.firstName} ${d.contact.lastName}`,
        subject: rule.emailSubject
          ? fillMergeTags(rule.emailSubject, ctx)
          : `${rule.organization.name} — votre formation touche à sa fin`,
        text: rule.emailBody
          ? fillMergeTags(rule.emailBody, ctx)
          : `Bonjour ${d.contact.firstName},\n\nVotre délai pour terminer "${rule.course.title}" touche à sa fin. Pensez à finaliser vos modules restants.\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
        senderName: rule.organization.name,
      });
    } catch {
      // Non-fatal — still stamped below.
    }
    await prisma.$transaction([
      prisma.dossier.update({ where: { id: d.id }, data: { rollingDurationAutoReminderSentAt: new Date() } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: rule.organizationId,
          contactId: d.contactId,
          dossierId: d.id,
          type: "rolling_duration_reminder",
          sentByUserId: "system",
          sentByName: "Automatisation (règle formation)",
        },
      }),
    ]);
    sent++;
  }
  return sent;
}

async function sendSatisfactionReminders(rule: Rule) {
  const now = new Date();
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: rule.organizationId,
      evaluationColdDone: false,
      satisfactionAutoReminderSentAt: null,
      session: { courseId: rule.courseId, mode: "FIXED_DATE", endsAt: { lt: now } },
    },
    include: { contact: true, session: true },
  });

  let sent = 0;
  for (const d of dossiers) {
    if (now < addDays(d.session.endsAt, rule.afterDays)) continue;
    const ctx = mergeContext(d.contact, rule.course, d.session, rule.organization);
    try {
      await sendTransactionalEmail({
        to: d.contact.email,
        toName: `${d.contact.firstName} ${d.contact.lastName}`,
        subject: rule.emailSubject ? fillMergeTags(rule.emailSubject, ctx) : `${rule.organization.name} — votre avis nous intéresse`,
        text: rule.emailBody
          ? fillMergeTags(rule.emailBody, ctx)
          : `Bonjour ${d.contact.firstName},\n\nMerci de nous faire part de votre avis sur la formation "${rule.course.title}".\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
        senderName: rule.organization.name,
      });
    } catch {
      // Non-fatal — still stamped below.
    }
    await prisma.$transaction([
      prisma.dossier.update({ where: { id: d.id }, data: { satisfactionAutoReminderSentAt: new Date() } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: rule.organizationId,
          contactId: d.contactId,
          dossierId: d.id,
          type: "satisfaction_reminder",
          sentByUserId: "system",
          sentByName: "Automatisation (règle formation)",
        },
      }),
    ]);
    sent++;
  }
  return sent;
}
