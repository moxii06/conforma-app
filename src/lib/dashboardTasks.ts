import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { addDays } from "date-fns";
import { canWriteRgpd } from "@/lib/tenant";
import { getCourseCompletion } from "@/lib/lms";

// "Relances" thresholds — how long to wait before a pending step counts as
// needing a follow-up. Not spec-mandated numbers, just sane defaults; make
// these configurable per-org if that's ever asked for.
const REMINDER_AFTER_DAYS = 5;
const CONVOCATION_WARNING_DAYS = 7;
const SUBCONTRACTOR_EXPIRY_WARNING_DAYS = 30;
// A FIXED_DATE dossier's prep (recueil/convention) starts flagging this many
// days before the session actually starts. A ROLLING dossier has no date to
// count back from, so it gets a flat grace period from enrollment instead —
// same two facts (recueil/convention), two different "before what" clocks.
const FIXED_SESSION_PREP_WARNING_DAYS = 10;
const ROLLING_PREP_DEADLINE_DAYS = 7;
// How far into a rolling dossier's allotted access-duration window (see
// Dossier.accessDurationDays) a warning nudge fires, as a fraction of the
// whole window — 0.7 means "70% of the time is gone and it's still not
// finished." At 1.0 (the whole window elapsed) it becomes overdue instead.
const ROLLING_DURATION_WARNING_RATIO = 0.7;

export type DashboardTask = {
  id: string;
  kind:
    | "needs_assessment"
    | "contract"
    | "platform_access"
    | "convocation"
    | "invoice_overdue"
    | "rgpd_suggestion"
    | "rgpd_deadline"
    | "session_draft"
    | "subcontractor_expiry"
    | "dossier_prep_needs_assessment"
    | "dossier_prep_contract"
    | "rolling_deadline_warning"
    | "rolling_deadline_overdue"
    | "satisfaction_not_collected";
  label: string;
  contactName: string;
  since: Date;
  href: string;
  overdue: boolean;
};

// The dashboard's unified "what needs doing" list — originally just sales
// follow-ups (hence the old name, followUps.ts), grown to cover every
// "something is waiting on a human" signal across the app: pending
// relances, overdue money, RGPD deadlines/AI suggestions, and sessions
// stuck in draft with learners already enrolled. One sorted list instead
// of five separate widgets, per the dashboard-around-tasks/invoices/money
// rework. Scoped by role using the same ownership rules as the rest of the
// app: SALES only sees their own prospects' items, TRAINER only their own
// sessions, ADMIN_OF/ADMIN_MANAGER see everything they have module access to.
export async function getDashboardTasks(organizationId: string, role: Role, userId: string): Promise<DashboardTask[]> {
  const threshold = addDays(new Date(), -REMINDER_AFTER_DAYS);
  const results: DashboardTask[] = [];

  const canSeeGeneral = role === Role.ADMIN_OF || role === Role.ADMIN_MANAGER;
  const canSeeSales = canSeeGeneral || role === Role.SALES;
  const canSeeTrainer = canSeeGeneral || role === Role.TRAINER;
  const canSeeRgpd = canWriteRgpd(role);

  // Client feedback: staff should be able to set a per-course "relance" rule
  // instead of only relying on the fixed thresholds below — when a course
  // has an active rule for a given trigger, its afterDays replaces that
  // trigger's generic deadline calculation for dossiers in that course.
  // Fetched once, grouped by trigger, and looked up per courseId below.
  const activeRules = canSeeTrainer
    ? await prisma.automationRule.findMany({ where: { organizationId, active: true } })
    : [];
  const rulesByTrigger = new Map<string, Map<string, (typeof activeRules)[number]>>();
  for (const rule of activeRules) {
    if (!rulesByTrigger.has(rule.trigger)) rulesByTrigger.set(rule.trigger, new Map());
    rulesByTrigger.get(rule.trigger)!.set(rule.courseId, rule);
  }

  if (canSeeSales) {
    const needsAssessments = await prisma.needsAssessmentRequest.findMany({
      where: {
        organizationId,
        status: "sent",
        sentAt: { lt: threshold },
        ...(role === Role.SALES ? { opportunity: { ownerId: userId } } : {}),
      },
      include: { contact: true },
      orderBy: { sentAt: "asc" },
    });
    for (const r of needsAssessments) {
      results.push({
        id: r.id,
        kind: "needs_assessment",
        label: "Test de positionnement envoyé, sans réponse",
        contactName: `${r.contact.firstName} ${r.contact.lastName}`,
        since: r.sentAt,
        href: "/crm",
        overdue: false,
      });
    }
  }

  if (canSeeGeneral) {
    const outreaches = await prisma.clientOutreach.findMany({
      where: {
        organizationId,
        status: "sent",
        sentAt: { lt: threshold },
        type: { in: ["contract", "platform_access"] },
      },
      include: { contact: true },
      orderBy: { sentAt: "asc" },
    });
    for (const o of outreaches) {
      results.push({
        id: o.id,
        kind: o.type as "contract" | "platform_access",
        label: o.type === "contract" ? "Contrat envoyé, non signé" : "Accès plateforme envoyé, non activé",
        contactName: `${o.contact.firstName} ${o.contact.lastName}`,
        since: o.sentAt,
        href: o.dossierId ? `/dossiers/${o.dossierId}` : "/crm",
        overdue: false,
      });
    }
  }

  if (canSeeTrainer) {
    const convocationRules = rulesByTrigger.get("convocation_missing");
    // A course-specific rule can only widen the window (never shrink it
    // below the app default) — worst case across all rules, evaluated with
    // a single query, then narrowed per-dossier below.
    const widestWindowDays = convocationRules
      ? Math.max(CONVOCATION_WARNING_DAYS, ...Array.from(convocationRules.values()).map((r) => r.afterDays))
      : CONVOCATION_WARNING_DAYS;
    const soon = addDays(new Date(), widestWindowDays);
    const dossiersNeedingConvocation = await prisma.dossier.findMany({
      where: {
        organizationId,
        convocationSent: false,
        session: {
          startsAt: { gte: new Date(), lte: soon },
          ...(role === Role.TRAINER ? { trainerId: userId } : {}),
        },
      },
      include: { contact: true, session: true },
      orderBy: { session: { startsAt: "asc" } },
    });
    for (const d of dossiersNeedingConvocation) {
      const rule = convocationRules?.get(d.session.courseId);
      const windowDays = rule ? rule.afterDays : CONVOCATION_WARNING_DAYS;
      if (d.session.startsAt > addDays(new Date(), windowDays)) continue;
      results.push({
        id: d.id,
        kind: "convocation",
        label: rule
          ? `Convocation à envoyer — session le ${d.session.startsAt.toLocaleDateString("fr-FR")} (règle formation)`
          : `Convocation à envoyer — session le ${d.session.startsAt.toLocaleDateString("fr-FR")}`,
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        since: d.session.startsAt,
        href: `/dossiers/${d.id}`,
        overdue: false,
      });
    }
  }

  // Recueil des besoins / convention still missing — same two facts,
  // checked against two different clocks depending on the session:
  // FIXED_DATE counts back from the real session date, ROLLING (bande
  // passante, no fixed date) counts forward from enrollment instead. Fetch
  // once and branch in-code rather than two near-duplicate Prisma queries.
  if (canSeeTrainer) {
    const now = new Date();
    const needsAssessmentRules = rulesByTrigger.get("needs_assessment_incomplete");
    const contractRules = rulesByTrigger.get("contract_not_signed");

    const incompleteDossiers = await prisma.dossier.findMany({
      where: {
        organizationId,
        OR: [{ needsAssessmentDone: false }, { contractSigned: false }],
        session: role === Role.TRAINER ? { trainerId: userId } : undefined,
      },
      include: { contact: true, session: true },
    });
    for (const d of incompleteDossiers) {
      const isRolling = d.session.mode === "ROLLING";
      const genericDeadline = isRolling
        ? addDays(d.createdAt, ROLLING_PREP_DEADLINE_DAYS)
        : addDays(d.session.startsAt, -FIXED_SESSION_PREP_WARNING_DAYS);
      const contactName = `${d.contact.firstName} ${d.contact.lastName}`;

      if (!d.contractSigned) {
        const rule = contractRules?.get(d.session.courseId);
        const deadline = rule ? addDays(d.createdAt, rule.afterDays) : genericDeadline;
        if (now >= deadline) {
          results.push({
            id: d.id,
            kind: "dossier_prep_contract",
            label: rule
              ? `Convention non signée — relance après ${rule.afterDays} j (règle formation)`
              : isRolling
                ? "Convention toujours non signée depuis l'inscription"
                : `Convention non signée — session le ${d.session.startsAt.toLocaleDateString("fr-FR")}`,
            contactName,
            since: deadline,
            href: `/dossiers/${d.id}`,
            overdue: rule ? true : isRolling || now >= d.session.startsAt,
          });
        }
      }

      if (!d.needsAssessmentDone) {
        const rule = needsAssessmentRules?.get(d.session.courseId);
        const deadline = rule ? addDays(d.createdAt, rule.afterDays) : genericDeadline;
        if (now >= deadline) {
          results.push({
            id: d.id,
            kind: "dossier_prep_needs_assessment",
            label: rule
              ? `Recueil des besoins non complété — relance après ${rule.afterDays} j (règle formation)`
              : isRolling
                ? "Recueil des besoins toujours manquant depuis l'inscription"
                : `Recueil des besoins manquant — session le ${d.session.startsAt.toLocaleDateString("fr-FR")}`,
            contactName,
            since: deadline,
            href: `/dossiers/${d.id}`,
            overdue: rule ? true : isRolling || now >= d.session.startsAt,
          });
        }
      }
    }
  }

  // Rolling (bande passante) dossiers: the completion clock only starts
  // once the learner actually opens the training (Dossier.firstAccessedAt,
  // set by markDossierAccessed in lib/lms.ts) — nothing to chase before
  // that, there's no "late" without a start. Once it has started, nudge as
  // the allotted duration runs out, then flag overdue once it's fully gone.
  if (canSeeTrainer) {
    const now = new Date();
    const rollingDossiers = await prisma.dossier.findMany({
      where: {
        organizationId,
        accessDurationDays: { not: null },
        firstAccessedAt: { not: null },
        session: {
          mode: "ROLLING",
          ...(role === Role.TRAINER ? { trainerId: userId } : {}),
        },
      },
      include: {
        contact: true,
        session: { include: { course: { include: { elearningModules: { include: { quiz: true } } } } } },
        elearningProgress: true,
        quizAttempts: true,
      },
    });
    const rollingRules = rulesByTrigger.get("rolling_duration_expiring");
    for (const d of rollingDossiers) {
      const modules = d.session.course.elearningModules;
      if (modules.length === 0) continue;
      const { allCompleted } = getCourseCompletion(modules, d.elearningProgress, d.quizAttempts);
      if (allCompleted) continue;

      const firstAccessedAt = d.firstAccessedAt!;
      const deadline = addDays(firstAccessedAt, d.accessDurationDays!);
      const overdue = now >= deadline;

      const rule = rollingRules?.get(d.session.courseId);
      if (!overdue) {
        if (rule) {
          if (now < addDays(deadline, -rule.afterDays)) continue;
        } else {
          const totalMs = deadline.getTime() - firstAccessedAt.getTime();
          const elapsedMs = now.getTime() - firstAccessedAt.getTime();
          const ratio = totalMs > 0 ? elapsedMs / totalMs : 1;
          if (ratio < ROLLING_DURATION_WARNING_RATIO) continue;
        }
      }

      results.push({
        id: d.id,
        kind: overdue ? "rolling_deadline_overdue" : "rolling_deadline_warning",
        label: overdue
          ? `Durée de formation dépassée sans achèvement (${d.accessDurationDays} j)`
          : `Échéance de formation proche, à relancer (${d.accessDurationDays} j)`,
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        since: deadline,
        href: `/dossiers/${d.id}`,
        overdue,
      });
    }
  }

  // Satisfaction survey ("à froid") not collected — only fires for courses
  // with an active rule (no global default existed for this before staff
  // could configure it, so nothing to fall back to). FIXED_DATE only: a
  // ROLLING session's endsAt is a synthetic placeholder, not a real
  // "the training is over" date to count from.
  if (canSeeTrainer) {
    const satisfactionRules = rulesByTrigger.get("satisfaction_not_collected");
    if (satisfactionRules && satisfactionRules.size > 0) {
      const now = new Date();
      const dossiersToSurvey = await prisma.dossier.findMany({
        where: {
          organizationId,
          evaluationColdDone: false,
          session: {
            mode: "FIXED_DATE",
            courseId: { in: Array.from(satisfactionRules.keys()) },
            endsAt: { lt: now },
            ...(role === Role.TRAINER ? { trainerId: userId } : {}),
          },
        },
        include: { contact: true, session: true },
      });
      for (const d of dossiersToSurvey) {
        const rule = satisfactionRules.get(d.session.courseId);
        if (!rule) continue;
        const deadline = addDays(d.session.endsAt, rule.afterDays);
        if (now < deadline) continue;
        results.push({
          id: d.id,
          kind: "satisfaction_not_collected",
          label: `Avis de satisfaction non recueilli — relance après ${rule.afterDays} j (règle formation)`,
          contactName: `${d.contact.firstName} ${d.contact.lastName}`,
          since: deadline,
          href: `/dossiers/${d.id}`,
          overdue: true,
        });
      }
    }
  }

  if (canSeeGeneral) {
    const overdueInvoices = await prisma.invoice.findMany({
      where: { organizationId, status: "OVERDUE" },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
    });
    for (const inv of overdueInvoices) {
      results.push({
        id: inv.id,
        kind: "invoice_overdue",
        label: `Facture ${inv.reference} en retard — ${(inv.amountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`,
        contactName: `${inv.contact.firstName} ${inv.contact.lastName}`,
        since: inv.createdAt,
        href: "/facturation?tab=factures",
        overdue: true,
      });
    }
  }

  if (canSeeGeneral) {
    const draftSessions = await prisma.session.findMany({
      where: { organizationId, status: "DRAFT", startsAt: { gte: new Date() }, dossiers: { some: {} } },
      include: { course: true, dossiers: true },
      orderBy: { startsAt: "asc" },
    });
    for (const s of draftSessions) {
      results.push({
        id: s.id,
        kind: "session_draft",
        label: `Session à valider — ${s.dossiers.length} apprenant${s.dossiers.length > 1 ? "s" : ""} inscrit${s.dossiers.length > 1 ? "s" : ""}`,
        contactName: s.course.title,
        since: s.startsAt,
        href: `/planning/${s.id}`,
        overdue: false,
      });
    }
  }

  if (canSeeRgpd) {
    const [suggestions, deadlines] = await Promise.all([
      prisma.emailMessage.findMany({
        where: { organizationId, rgpdSuggestedType: { not: null } },
        orderBy: { receivedAt: "asc" },
      }),
      prisma.rightsRequest.findMany({
        where: { organizationId, status: "open" },
        orderBy: { deadline: "asc" },
      }),
    ]);
    for (const m of suggestions) {
      results.push({
        id: m.id,
        kind: "rgpd_suggestion",
        label: "Email suggéré comme demande de droit RGPD, à confirmer",
        contactName: m.fromName || m.fromAddress,
        since: m.receivedAt,
        href: "/inbox",
        overdue: false,
      });
    }
    const now = new Date();
    for (const r of deadlines) {
      results.push({
        id: r.id,
        kind: "rgpd_deadline",
        label: `Demande RGPD — échéance ${r.deadline.toLocaleDateString("fr-FR")}`,
        contactName: r.personLabel,
        since: r.deadline,
        href: "/rgpd?tab=droits",
        overdue: r.deadline < now,
      });
    }
  }

  if (canSeeGeneral) {
    const expiryThreshold = addDays(new Date(), SUBCONTRACTOR_EXPIRY_WARNING_DAYS);
    const subcontractors = await prisma.subcontractor.findMany({
      where: {
        organizationId,
        status: "active",
        OR: [{ contractEndDate: { lt: expiryThreshold } }, { qualificationExpiryDate: { lt: expiryThreshold } }],
      },
    });
    const now = new Date();
    for (const s of subcontractors) {
      const dates = [s.contractEndDate, s.qualificationExpiryDate].filter((d): d is Date => d != null && d < expiryThreshold);
      if (dates.length === 0) continue;
      const soonest = dates.reduce((a, b) => (a < b ? a : b));
      results.push({
        id: s.id,
        kind: "subcontractor_expiry",
        label: soonest === s.contractEndDate ? "Contrat sous-traitant arrivant à échéance" : "Qualification de sous-traitant arrivant à expiration",
        contactName: s.name,
        since: soonest,
        href: "/team",
        overdue: soonest < now,
      });
    }
  }

  return results.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.since.getTime() - b.since.getTime();
  });
}
