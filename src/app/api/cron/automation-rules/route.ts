import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import { createSessionInvitation } from "@/lib/sessionInvitations";
import { fillMergeTags, type MergeTagContext } from "@/lib/automationRules";
import { sendSatisfactionSurvey } from "@/lib/satisfactionSurveys";
import { runTrialOnboarding } from "@/lib/onboardingEmails";
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

  const origin = new URL(request.url).origin;

  const rules = await prisma.automationRule.findMany({
    where: { active: true, sendEmail: true },
    include: { organization: true, course: true },
  });

  let sent = await sendHotSatisfactionSurveys(origin);
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
      sent += await sendSatisfactionReminders(rule, origin);
    } else if (rule.trigger === "session_reminder") {
      sent += await sendSessionReminders(rule);
    } else if (rule.trigger === "certificate_expiring") {
      sent += await sendCertificateExpiryReminders(rule);
    }
  }

  // Séquence d'onboarding d'essai (marketing propre de Jalon) — indépendante
  // des AutomationRules ci-dessus. Voir src/lib/onboardingEmails.ts.
  const onboardingSent = await runTrialOnboarding(origin);

  return NextResponse.json({ sent, onboardingSent });
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

// Distinct from sendConvocations: the convocation is the invitation itself
// (sent once, whenever staff or the convocation_missing rule triggers it,
// possibly weeks ahead); this is a courtesy nudge shortly before the
// session actually starts, for learners already convoked — sending it to
// someone with no convocation yet would be premature, so convocationSent
// is a precondition here, not the thing being fixed.
async function sendSessionReminders(rule: Rule) {
  const now = new Date();
  const soon = addDays(now, rule.afterDays);
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: rule.organizationId,
      convocationSent: true,
      sessionReminderSentAt: null,
      session: { courseId: rule.courseId, mode: "FIXED_DATE", startsAt: { gte: now, lte: soon } },
    },
    include: { contact: true, session: true },
  });

  let sent = 0;
  for (const d of dossiers) {
    const ctx = mergeContext(d.contact, rule.course, d.session, rule.organization);
    const practicalInfo =
      d.session.format === "IN_PERSON"
        ? d.session.location
          ? `Lieu : ${d.session.location}`
          : ""
        : d.session.meetingLink
          ? `Lien de connexion : ${d.session.meetingLink}`
          : "";
    try {
      await sendTransactionalEmail({
        to: d.contact.email,
        toName: `${d.contact.firstName} ${d.contact.lastName}`,
        subject: rule.emailSubject
          ? fillMergeTags(rule.emailSubject, ctx)
          : `${rule.organization.name} — rappel : votre session approche`,
        text: rule.emailBody
          ? fillMergeTags(rule.emailBody, ctx)
          : `Bonjour ${d.contact.firstName},\n\nPetit rappel : votre formation "${rule.course.title}" a lieu le ${ctx.sessionDateLabel}.\n${practicalInfo}\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
        senderName: rule.organization.name,
      });
    } catch {
      // Non-fatal — still stamped below.
    }
    await prisma.$transaction([
      prisma.dossier.update({ where: { id: d.id }, data: { sessionReminderSentAt: new Date() } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: rule.organizationId,
          contactId: d.contactId,
          dossierId: d.id,
          type: "session_reminder",
          sentByUserId: "system",
          sentByName: "Automatisation (règle formation)",
        },
      }),
    ]);
    sent++;
  }
  return sent;
}

// Reads expiry off Document.expiresAt (set once, at the moment a given
// certificate was actually issued — see /api/lms/dossiers/[id]/certificate)
// rather than recomputing it from Course.certificateValidityMonths, so a
// later change to the course's validity setting never silently reschedules
// reminders for attestations already granted under a different duration.
async function sendCertificateExpiryReminders(rule: Rule) {
  const now = new Date();
  const soon = addDays(now, rule.afterDays);
  const documents = await prisma.document.findMany({
    where: {
      organizationId: rule.organizationId,
      templateOrigin: "lms_certificate",
      expiresAt: { gte: now, lte: soon },
      expiryReminderSentAt: null,
      dossier: { session: { courseId: rule.courseId } },
    },
    include: { dossier: { include: { contact: true, session: true } } },
  });

  let sent = 0;
  for (const doc of documents) {
    const d = doc.dossier;
    if (!d) continue;
    const ctx = mergeContext(d.contact, rule.course, d.session, rule.organization);
    const expiryLabel = doc.expiresAt!.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    try {
      await sendTransactionalEmail({
        to: d.contact.email,
        toName: `${d.contact.firstName} ${d.contact.lastName}`,
        subject: rule.emailSubject
          ? fillMergeTags(rule.emailSubject, ctx)
          : `${rule.organization.name} — votre attestation arrive à expiration`,
        text: rule.emailBody
          ? fillMergeTags(rule.emailBody, ctx)
          : `Bonjour ${d.contact.firstName},\n\nVotre attestation pour la formation "${rule.course.title}" arrive à expiration le ${expiryLabel}. Contactez-nous pour organiser son renouvellement.\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
        senderName: rule.organization.name,
      });
    } catch {
      // Non-fatal — still stamped below.
    }
    await prisma.$transaction([
      prisma.document.update({ where: { id: doc.id }, data: { expiryReminderSentAt: new Date() } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: rule.organizationId,
          contactId: d.contactId,
          dossierId: d.id,
          type: "certificate_expiring",
          sentByUserId: "system",
          sentByName: "Automatisation (règle formation)",
        },
      }),
    ]);
    sent++;
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

async function sendSatisfactionReminders(rule: Rule, origin: string) {
  const now = new Date();
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: rule.organizationId,
      evaluationColdDone: false,
      satisfactionAutoReminderSentAt: null,
      session: { courseId: rule.courseId, mode: "FIXED_DATE", endsAt: { lt: now } },
    },
    include: { contact: true, session: { include: { course: true } } },
  });

  // A real cold survey (with at least one question) takes priority over
  // the generic "your opinion matters" nudge — same trigger/delay, but the
  // email now carries an actual link to the questionnaire instead of just
  // a reminder to go find one.
  const coldSurvey = await prisma.satisfactionSurvey.findUnique({
    where: { courseId_kind: { courseId: rule.courseId, kind: "cold" } },
    include: { questions: { select: { id: true }, take: 1 } },
  });
  const hasColdSurvey = Boolean(coldSurvey && coldSurvey.questions.length > 0);

  let sent = 0;
  for (const d of dossiers) {
    if (now < addDays(d.session.endsAt, rule.afterDays)) continue;

    if (hasColdSurvey && coldSurvey) {
      await sendSatisfactionSurvey({
        organization: rule.organization,
        dossier: d,
        contact: d.contact,
        courseTitle: rule.course.title,
        surveyId: coldSurvey.id,
        origin,
      });
    } else {
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

// Unlike the cold trigger (per-course AutomationRule with a configurable
// delay), the hot survey has nothing to configure — client feedback: it
// should just go out automatically the moment a FIXED_DATE session ends,
// for every course that has a hot survey defined. sendSatisfactionSurvey's
// own idempotency (reuses an existing response row) is the only guard
// needed against re-sending on the next day's cron run.
async function sendHotSatisfactionSurveys(origin: string) {
  const now = new Date();
  const surveys = await prisma.satisfactionSurvey.findMany({
    where: { kind: "hot" },
    include: { course: true, organization: true, questions: { select: { id: true }, take: 1 } },
  });

  let sent = 0;
  for (const survey of surveys) {
    if (survey.questions.length === 0) continue;
    const dossiers = await prisma.dossier.findMany({
      where: {
        organizationId: survey.organizationId,
        evaluationHotDone: false,
        session: { courseId: survey.courseId, mode: "FIXED_DATE", endsAt: { lt: now } },
      },
      include: { contact: true },
    });
    for (const d of dossiers) {
      const existing = await prisma.satisfactionSurveyResponse.findUnique({
        where: { surveyId_dossierId: { surveyId: survey.id, dossierId: d.id } },
      });
      if (existing) continue;
      await sendSatisfactionSurvey({
        organization: survey.organization,
        dossier: d,
        contact: d.contact,
        courseTitle: survey.course.title,
        surveyId: survey.id,
        origin,
      });
      sent++;
    }
  }
  return sent;
}
