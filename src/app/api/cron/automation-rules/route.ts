import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import { assertCronRequest } from "@/lib/cronAuth";
import { createSessionInvitation } from "@/lib/sessionInvitations";
import { fillMergeTags, type MergeTagContext } from "@/lib/automationRules";
import { sendSatisfactionSurvey } from "@/lib/satisfactionSurveys";
import { runTrialOnboarding } from "@/lib/onboardingEmails";
import { syncAllMailboxConnections } from "@/lib/mailboxCron";
import { sendDailyDigests } from "@/lib/dailyDigest";
import { sendDuePlatformEmails } from "@/lib/platformEmailsCron";
import { executerChaine, type EtapeCron } from "@/lib/cronRunner";
import {
  ouvrirPassage,
  noterEtapeEnCours,
  cloturerPassage,
  CHAINE_QUOTIDIENNE,
  SEUIL_BLOCAGE,
} from "@/lib/cronCheckpoint";
import { getCourseCompletion } from "@/lib/lms";
import type { Contact, Course, Session, Organization } from "@prisma/client";
import { resolveAppOrigin } from "@/lib/appUrl";
import {
  fenetreRelance,
  plancherAnciennete,
  plancherPremierAcces,
  MAX_ENQUETES_PAR_PASSAGE,
} from "@/lib/relanceWindow";
// C'est ici que le silence compte le plus : un dossier clos ne doit plus
// recevoir d'email automatique. Un email parti ne se rattrape pas.
import { DOSSIERS_ACTIFS } from "@/lib/dossierArchive";

// Headroom for the extra work now bundled into this same daily run
// (mailbox sync + digest emails across every org/user, see below) — Vercel
// Hobby plans cap cron jobs at 2, so new scheduled work is added to this
// existing route/schedule instead of a new vercel.json entry.
export const maxDuration = 60;


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

/**
 * La chaîne quotidienne (voir vercel.json). Requiert CRON_SECRET, que
 * Vercel envoie en `Authorization: Bearer <CRON_SECRET>` dès que la
 * variable existe ; sans elle la route refuse en production plutôt que de
 * tourner ouverte (voir assertCronRequest).
 *
 * L'ordre des étapes n'est plus fixe : chaque passage démarre là où le
 * précédent s'est arrêté. Avant cette bascule, les dernières étapes —
 * synchronisation des boîtes mail, synthèses quotidiennes — n'étaient
 * jamais atteintes dès que les premières mangeaient les 60 secondes, et
 * comme le lendemain repartait dans le même ordre, elles ne l'étaient plus
 * jamais. Voir src/lib/cronRunner.ts pour le mécanisme.
 */
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;

  const origin = resolveAppOrigin(request);
  const etat = await ouvrirPassage(CHAINE_QUOTIDIENNE);

  const etapes: EtapeCron[] = [
    {
      nom: "enquetes_satisfaction",
      libelle: "Enquêtes de satisfaction à chaud",
      executer: async () => ({ envoyees: await sendHotSatisfactionSurveys(origin) }),
    },
    {
      nom: "regles_relance",
      libelle: "Règles de relance des formations",
      executer: async () => ({ envoyees: await executerReglesRelance(origin) }),
    },
    {
      nom: "echeanciers",
      libelle: "Échéances de paiement à émettre",
      executer: async () => ({ emises: await issueDueInstalments() }),
    },
    {
      nom: "onboarding_essai",
      libelle: "Séquence d'accueil des essais",
      executer: async () => ({ envoyes: await runTrialOnboarding(origin) }),
    },
    {
      nom: "emails_plateforme",
      libelle: "Emails programmés depuis le back-office",
      executer: () => sendDuePlatformEmails(),
    },
    {
      nom: "synchro_boites_mail",
      libelle: "Synchronisation des boîtes mail",
      executer: () => syncAllMailboxConnections(),
    },
    {
      // Volontairement après la synchro des boîtes mail quand l'ordre le
      // permet : la synthèse reflète alors les suggestions RGPD et les
      // emails du jour. La rotation peut l'en séparer un jour sur deux —
      // une synthèse d'un jour en retard vaut mieux qu'aucune synthèse.
      nom: "synthese_quotidienne",
      libelle: "Synthèses « à faire » par utilisateur",
      executer: () => sendDailyDigests(origin),
    },
  ];

  const passage = await executerChaine({
    etapes,
    depart: etat.depart,
    avantEtape: (nom) => noterEtapeEnCours(CHAINE_QUOTIDIENNE, nom),
  });

  await cloturerPassage(CHAINE_QUOTIDIENNE, passage.prochainDepart, passage.tourComplet);

  return NextResponse.json({
    tourComplet: passage.tourComplet,
    etapes: passage.resultats,
    differees: passage.differees,
    prochainDepart: passage.prochainDepart,
    // Remonté dans la réponse ET visible dans le back-office : une étape
    // qui ne tient pas dans une exécution ne doit pas rester un chiffre
    // dans un journal que personne ne lit.
    ...(etat.stalledRuns >= SEUIL_BLOCAGE
      ? { alerte: `L'étape « ${etat.depart} » a été coupée ${etat.stalledRuns} passages de suite.` }
      : {}),
  });
}

/**
 * Les relances configurées par formation. Une étape à part entière de la
 * chaîne : c'est la plus longue, et celle qui affamait toutes les autres.
 */
async function executerReglesRelance(origin: string): Promise<number> {
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
      sent += await sendSatisfactionReminders(rule, origin);
    } else if (rule.trigger === "session_reminder") {
      sent += await sendSessionReminders(rule);
    } else if (rule.trigger === "certificate_expiring") {
      sent += await sendCertificateExpiryReminders(rule);
    } else if (rule.trigger === "invoice_overdue") {
      sent += await sendInvoiceOverdueReminders(rule);
    }
  }
  return sent;
}

// Audit P1 : le balayage « session livrée → étape À facturer » a disparu
// avec cette étape. Le besoin est couvert par la tâche
// `session_uninvoiced` du tableau de bord, recalculée à chaque affichage —
// donc sans le délai d'un jour qu'imposait ce cron. Voir lib/pipeline.ts.

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// Flips a scheduled instalment DRAFT → SENT shortly before it falls due,
// with the notification email. This staging is the whole reason instalments
// are born DRAFT (see materialiseScheduleFromSignedDocument): without it the
// learner would receive the entire schedule as invoices on signature day —
// and the overdue detection in dashboardTasks, which deliberately ignores
// DRAFT, would never see an unissued instalment slip past its date.
//
// The status flip is the idempotency guard: once SENT, the row never
// matches this query again.
const ISSUE_AHEAD_DAYS = 7;

async function issueDueInstalments() {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "DRAFT",
      installmentNumber: { not: null },
      dueDate: { lte: addDays(new Date(), ISSUE_AHEAD_DAYS) },
    },
    include: { contact: true, organization: true },
  });

  let issued = 0;
  for (const inv of invoices) {
    const dueLabel = inv.dueDate!.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    try {
      await sendTransactionalEmail({
        to: inv.contact.email,
        toName: `${inv.contact.firstName} ${inv.contact.lastName}`,
        subject: `${inv.organization.name} — échéance ${inv.installmentNumber}/${inv.installmentTotal} (${inv.reference})`,
        text:
          `Bonjour ${inv.contact.firstName},\n\n` +
          `Conformément à l'échéancier prévu par votre contrat de formation, l'échéance ` +
          `${inv.installmentNumber} sur ${inv.installmentTotal}, d'un montant de ${formatEuros(inv.amountCents)}, ` +
          `est à régler pour le ${dueLabel} (référence ${inv.reference}).\n\n` +
          `À bientôt,\nL'équipe ${inv.organization.name}`,
        senderName: inv.organization.name,
      });
    } catch {
      // Non-fatal — the invoice still flips to SENT below: it IS due, and
      // dashboardTasks will surface it; only the courtesy email failed.
    }
    await prisma.$transaction([
      prisma.invoice.update({ where: { id: inv.id }, data: { status: "SENT" } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: inv.organizationId,
          contactId: inv.contactId,
          dossierId: inv.dossierId,
          type: "instalment_issued",
          sentByUserId: "system",
          sentByName: "Automatisation (échéancier)",
        },
      }),
    ]);
    issued++;
  }
  return issued;
}

// The learner-facing half of "l'OFP doit être informé si une échéance n'a
// pas été régularisée": the staff half already exists (dashboardTasks flags
// any SENT/OVERDUE invoice past its dueDate, instalment or not). This adds
// the automated nudge to the learner, per course rule, once per invoice —
// overdueReminderSentAt is the stamp, same pattern as every other trigger.
async function sendInvoiceOverdueReminders(rule: Rule) {
  const threshold = addDays(new Date(), -rule.afterDays);
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: rule.organizationId,
      status: { in: ["SENT", "OVERDUE"] },
      // Même garde-fou que les autres relances : une facture importée d'un
      // ancien outil et restée « envoyée » faute d'avoir été rapprochée ne
      // doit pas déclencher une relance de paiement à un client d'il y a
      // trois ans. Le retard reste visible dans le « à faire ».
      dueDate: fenetreRelance(rule.afterDays),
      overdueReminderSentAt: null,
      dossier: { session: { courseId: rule.courseId } },
    },
    include: { contact: true, dossier: { include: { session: true } } },
  });

  let sent = 0;
  for (const inv of invoices) {
    const d = inv.dossier;
    if (!d) continue;
    const ctx = mergeContext(inv.contact, rule.course, d.session, rule.organization);
    const dueLabel = inv.dueDate!.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const instalmentLabel =
      inv.installmentNumber != null ? `l'échéance ${inv.installmentNumber} sur ${inv.installmentTotal}` : `la facture ${inv.reference}`;
    try {
      await sendTransactionalEmail({
        to: inv.contact.email,
        toName: `${inv.contact.firstName} ${inv.contact.lastName}`,
        subject: rule.emailSubject
          ? fillMergeTags(rule.emailSubject, ctx)
          : `${rule.organization.name} — rappel : règlement en attente (${inv.reference})`,
        text: rule.emailBody
          ? fillMergeTags(rule.emailBody, ctx)
          : `Bonjour ${inv.contact.firstName},\n\nSauf erreur de notre part, ${instalmentLabel}, d'un montant de ${formatEuros(inv.amountCents)} et échue le ${dueLabel}, reste en attente de règlement.\n\nSi votre paiement est déjà parti, merci de ne pas tenir compte de ce message.\n\nÀ bientôt,\nL'équipe ${rule.organization.name}`,
        senderName: rule.organization.name,
      });
    } catch {
      // Non-fatal — still stamped below so a bad address doesn't retry
      // forever; the invoice stays visible in the dashboard's overdue list.
    }
    await prisma.$transaction([
      prisma.invoice.update({ where: { id: inv.id }, data: { overdueReminderSentAt: new Date() } }),
      prisma.clientOutreach.create({
        data: {
          organizationId: rule.organizationId,
          contactId: inv.contactId,
          dossierId: inv.dossierId,
          type: "invoice_overdue_reminder",
          sentByUserId: "system",
          sentByName: "Automatisation (règle formation)",
        },
      }),
    ]);
    sent++;
  }
  return sent;
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
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: rule.organizationId,
      ...DOSSIERS_ACTIFS,
      ...opts.where,
      // Fenêtre fermée aux deux bouts : assez ancien pour mériter une
      // relance, pas assez pour qu'elle soit absurde (voir relanceWindow.ts).
      createdAt: fenetreRelance(rule.afterDays),
      session: { courseId: rule.courseId },
    },
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
      ...DOSSIERS_ACTIFS,
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
      ...DOSSIERS_ACTIFS,
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
      ...DOSSIERS_ACTIFS,
      accessDurationDays: { not: null },
      // L'échéance vaut firstAccessedAt + accessDurationDays, et Prisma ne
      // sait pas filtrer sur une somme de colonnes — la sélection se
      // faisait donc en mémoire, après avoir chargé TOUS les dossiers en
      // continu avec leur arbre e-learning complet.
      //
      // On borne ce qu'on peut borner en base : au-delà de la plus longue
      // durée d'accès plausible, l'échéance est forcément dépassée depuis
      // longtemps et aucune relance « votre accès expire bientôt » n'a de
      // sens. Le filtre exact reste en JS juste après, sur un lot devenu
      // raisonnable.
      firstAccessedAt: { not: null, gte: plancherPremierAcces(rule.afterDays) },
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
      ...DOSSIERS_ACTIFS,
      evaluationColdDone: false,
      satisfactionAutoReminderSentAt: null,
      // Borne basse : on ne demande pas son avis à quelqu'un sur une
      // formation terminée il y a deux ans (voir
      // RELANCE_ANCIENNETE_MAX_JOURS).
      session: { courseId: rule.courseId, mode: "FIXED_DATE", endsAt: { lt: now, gte: plancherAnciennete() } },
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
        ...DOSSIERS_ACTIFS,
        evaluationHotDone: false,
        // Deux bornes ajoutées par l'audit S7, pour deux raisons
        // différentes. La borne de date : `evaluationHotDone` ne passe à
        // vrai que si l'apprenant RÉPOND — un dossier dont l'enquête est
        // partie mais restée sans réponse revenait donc dans le lot à
        // chaque passage, à vie, et le lot ne faisait que grossir. Le
        // plafond : même avec la borne, un premier passage après import
        // peut viser des centaines de dossiers ; on en traite un lot par
        // jour plutôt que de dépasser les 60 s et de ne rien envoyer du
        // tout — les suivants partiront demain.
        session: { courseId: survey.courseId, mode: "FIXED_DATE", endsAt: { lt: now, gte: plancherAnciennete() } },
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: MAX_ENQUETES_PAR_PASSAGE,
    });
    if (dossiers.length === 0) continue;

    // Une seule requête pour savoir qui a déjà répondu, au lieu d'un
    // findUnique par dossier : c'était le N+1 le plus coûteux du cron, et
    // la première chose qui faisait déborder les 60 s.
    const dejaRepondu = new Set(
      (
        await prisma.satisfactionSurveyResponse.findMany({
          where: { surveyId: survey.id, dossierId: { in: dossiers.map((d) => d.id) } },
          select: { dossierId: true },
        })
      ).map((r) => r.dossierId)
    );

    for (const d of dossiers) {
      if (dejaRepondu.has(d.id)) continue;
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
