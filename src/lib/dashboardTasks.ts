import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { addDays } from "date-fns";
import { canWriteRgpd } from "@/lib/tenant";
import { getCourseCompletion } from "@/lib/lms";
import { AWAITING_FUNDER, isAwaitingFunderTooLong, isAgreementExpiringSoon } from "@/lib/funding";

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
// Client feedback: staff had no way to spot a learner who started a
// formation and then went quiet — nothing flagged it until the rolling
// access window ran out (or never, for a FIXED_DATE session). Two weeks
// with no tracked LMS event is a reasonable generic "probably dropped off"
// signal, independent of session mode.
const LEARNER_INACTIVITY_DAYS = 14;

export type DashboardTask = {
  id: string;
  kind:
    | "needs_assessment"
    | "contract"
    | "platform_access"
    | "platform_access_after_payment"
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
    | "satisfaction_not_collected"
    | "learner_inactive"
    | "bank_transaction_pending"
    | "funding_no_reply"
    | "funding_agreement_expiring"
    | "qualiopi_certificate_expiring"
    | "qualiopi_audit_upcoming"
    | "qualiopi_finding_open"
    | "intervenant_evaluation_due";
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

  // Tasks are recomputed live from dossier/invoice/etc. state on every load
  // — there's no row to mark done, so "ignorer" is tracked separately here
  // and filtered out just before returning.
  const dismissals = await prisma.dashboardTaskDismissal.findMany({
    where: { organizationId },
    select: { kind: true, entityId: true },
  });
  const dismissedKeys = new Set(dismissals.map((d) => `${d.kind}:${d.entityId}`));

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

    // The other half of the payment→access chain: recordInvoicePayment()
    // (lib/payments.ts) already advances the CRM pipeline to PAID on its
    // own, but sending the learner their platform access stayed a manual
    // button nothing pointed at — staff had to just remember. This surfaces
    // every dossier whose contact has a PAID invoice but no platform_access
    // outreach yet, immediately (no aging threshold: money arrived, the
    // learner is waiting).
    const paidAwaitingAccess = await prisma.dossier.findMany({
      where: {
        organizationId,
        contact: { invoices: { some: { status: "PAID" } } },
        clientOutreaches: { none: { type: "platform_access" } },
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
    });
    for (const d of paidAwaitingAccess) {
      results.push({
        id: d.id,
        kind: "platform_access_after_payment",
        label: "Paiement reçu — envoyer les accès plateforme",
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        since: d.createdAt,
        href: `/dossiers/${d.id}`,
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

  // Décrochage: a learner who opened their formation at least once
  // (firstAccessedAt) but hasn't triggered a single tracked LMS event since
  // — applies to both FIXED_DATE and ROLLING sessions alike, unlike the
  // rolling-only deadline check above, since "gone quiet" is a signal
  // regardless of whether there's a hard access-duration clock running.
  if (canSeeTrainer) {
    const now = new Date();
    const inactivityThreshold = addDays(now, -LEARNER_INACTIVITY_DAYS);
    const startedDossiers = await prisma.dossier.findMany({
      where: {
        organizationId,
        firstAccessedAt: { not: null },
        session: role === Role.TRAINER ? { trainerId: userId } : undefined,
      },
      include: {
        contact: true,
        session: { include: { course: { include: { elearningModules: { include: { quiz: true } } } } } },
        elearningProgress: true,
        quizAttempts: true,
      },
    });
    for (const d of startedDossiers) {
      const modules = d.session.course.elearningModules;
      if (modules.length === 0) continue;
      const { allCompleted } = getCourseCompletion(modules, d.elearningProgress, d.quizAttempts);
      if (allCompleted) continue;

      const lastActivity = d.elearningProgress.reduce<Date>((latest, p) => {
        const candidate = p.lastEventAt ?? p.assignedAt;
        return candidate > latest ? candidate : latest;
      }, d.firstAccessedAt!);
      if (lastActivity > inactivityThreshold) continue;

      const inactiveDays = Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000);
      results.push({
        id: d.id,
        kind: "learner_inactive",
        label: `Aucune activité depuis ${inactiveDays} j — apprenant potentiellement décroché`,
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        since: lastActivity,
        href: `/dossiers/${d.id}`,
        overdue: true,
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
    // Auto-detected the moment dueDate passes (SENT/SIGNED, never PAID/DRAFT)
    // — staff no longer has to remember to flip status to OVERDUE by hand.
    // The manual OVERDUE status still always surfaces here too, for
    // invoices with no dueDate (pre-dating the field) or a staff judgment
    // call independent of the date — same "automatic by default, manual
    // override always wins" pattern as the rest of the app's statuses.
    const now = new Date();
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        organizationId,
        status: { notIn: ["PAID", "DRAFT"] },
        OR: [{ status: "OVERDUE" }, { dueDate: { lt: now } }],
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
    });
    for (const inv of overdueInvoices) {
      results.push({
        id: inv.id,
        kind: "invoice_overdue",
        label: `Facture ${inv.reference} en retard — ${(inv.amountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`,
        contactName: `${inv.contact.firstName} ${inv.contact.lastName}`,
        since: inv.dueDate ?? inv.createdAt,
        href: "/facturation?tab=factures",
        overdue: true,
      });
    }
  }

  // Funder follow-ups — the two moments OPCO money silently dies: a
  // deposited dossier the funder never answered (chase before it stalls past
  // their own processing deadlines), and a granted agreement whose validity
  // window is closing while the invoice still isn't issued or settled (past
  // validUntil, the funder no longer owes anything). Thresholds and status
  // semantics live in lib/funding.ts next to the rest of the arithmetic.
  if (canSeeGeneral) {
    const now = new Date();
    const commitments = await prisma.fundingCommitment.findMany({
      where: { organizationId, status: { in: [...AWAITING_FUNDER, "granted", "invoiced"] } },
      include: {
        funder: { select: { name: true } },
        dossier: { include: { contact: true } },
      },
    });
    for (const c of commitments) {
      const contactName = `${c.dossier.contact.firstName} ${c.dossier.contact.lastName}`;
      if (isAwaitingFunderTooLong(c, now)) {
        const silentDays = Math.floor((now.getTime() - c.depositedAt!.getTime()) / 86_400_000);
        results.push({
          id: c.id,
          kind: "funding_no_reply",
          label: `Dossier ${c.funder.name} sans réponse depuis ${silentDays} j — relancez le financeur`,
          contactName,
          since: c.depositedAt!,
          href: `/dossiers/${c.dossierId}?tab=financement`,
          overdue: true,
        });
      }
      if (isAgreementExpiringSoon(c, now)) {
        const expired = c.validUntil! < now;
        const dateLabel = c.validUntil!.toLocaleDateString("fr-FR");
        results.push({
          id: c.id,
          kind: "funding_agreement_expiring",
          label: expired
            ? `Accord ${c.funder.name} expiré le ${dateLabel} — contactez le financeur au plus vite`
            : c.status === "granted"
              ? `Accord ${c.funder.name} valable jusqu'au ${dateLabel} — générez la facture avant cette date`
              : `Accord ${c.funder.name} valable jusqu'au ${dateLabel} — faites régler la facture avant cette date`,
          contactName,
          since: c.validUntil!,
          href: `/dossiers/${c.dossierId}?tab=financement`,
          overdue: expired,
        });
      }
    }
  }

  if (canSeeGeneral) {
    // One aggregate row, not one per transaction — a single CSV import can
    // drop in dozens at once, and the actual review already happens on the
    // dedicated /facturation?tab=a-valider page, not here. "id" is a
    // constant rather than an entity id since there's only ever one such
    // aggregate per organization.
    const pendingBankCount = await prisma.bankTransaction.count({ where: { organizationId, status: "pending" } });
    if (pendingBankCount > 0) {
      results.push({
        id: "pending",
        kind: "bank_transaction_pending",
        label: `${pendingBankCount} transaction${pendingBankCount > 1 ? "s" : ""} bancaire${pendingBankCount > 1 ? "s" : ""} à valider`,
        contactName: "Rapprochement bancaire",
        since: new Date(),
        href: "/facturation?tab=a-valider",
        overdue: false,
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

  // Qualiopi certification deadlines — admin-only (same visibility as the
  // /qualiopi module). Three signals, all cheap reads: the certificate's
  // 3-year validity running out, the certifier-announced next audit getting
  // close, and audit non-conformities still waiting for a corrective-action
  // response ("ouverte" — "levée" is a normal resting state until the next
  // audit and doesn't alert).
  if (canSeeGeneral) {
    const now = new Date();
    const [orgQualiopi, openFindings] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { qualiopiCertificateUntil: true, nextAuditDate: true },
      }),
      prisma.qualiopiAuditFinding.findMany({
        where: { audit: { organizationId }, status: "ouverte" },
        include: { audit: { select: { auditDate: true } } },
      }),
    ]);

    if (orgQualiopi?.qualiopiCertificateUntil && orgQualiopi.qualiopiCertificateUntil < addDays(now, 180)) {
      results.push({
        id: "qualiopi-certificate",
        kind: "qualiopi_certificate_expiring",
        label:
          orgQualiopi.qualiopiCertificateUntil < now
            ? "Certificat Qualiopi expiré"
            : "Certificat Qualiopi expire bientôt — planifier l'audit de renouvellement",
        contactName: "Certification Qualiopi",
        since: orgQualiopi.qualiopiCertificateUntil,
        href: "/qualiopi?tab=audits",
        overdue: orgQualiopi.qualiopiCertificateUntil < now,
      });
    }

    if (orgQualiopi?.nextAuditDate && orgQualiopi.nextAuditDate < addDays(now, 90)) {
      results.push({
        id: "qualiopi-next-audit",
        kind: "qualiopi_audit_upcoming",
        label: "Audit Qualiopi dans moins de 3 mois — préparer le dossier de preuves",
        contactName: "Certification Qualiopi",
        since: orgQualiopi.nextAuditDate,
        href: "/qualiopi?tab=preparation-audit",
        overdue: orgQualiopi.nextAuditDate < now,
      });
    }

    for (const f of openFindings) {
      results.push({
        id: f.id,
        kind: "qualiopi_finding_open",
        label: `Non-conformité ${f.severity} (indicateur ${f.indicatorNumber}) — proposer une action corrective`,
        contactName: "Audit Qualiopi",
        since: f.audit.auditDate,
        href: "/qualiopi?tab=audits",
        overdue: f.audit.auditDate < addDays(now, -30),
      });
    }

    // Annual intervenant evaluation (indicators 21-22 — the pilot's own
    // 2022 NC majeure): every active internal trainer and subcontractor
    // should have a written evaluation less than 12 months old.
    const evalThreshold = addDays(now, -366);
    const [activeTrainers, activeSubs, recentEvals] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId, role: Role.TRAINER, status: "active" },
        select: { id: true, name: true, email: true },
      }),
      prisma.subcontractor.findMany({ where: { organizationId, status: "active" }, select: { id: true, name: true } }),
      prisma.intervenantEvaluation.findMany({
        where: { organizationId, evaluatedAt: { gte: evalThreshold } },
        select: { userId: true, subcontractorId: true },
      }),
    ]);
    const evaluatedUserIds = new Set(recentEvals.map((e) => e.userId).filter(Boolean));
    const evaluatedSubIds = new Set(recentEvals.map((e) => e.subcontractorId).filter(Boolean));
    for (const t of activeTrainers) {
      if (evaluatedUserIds.has(t.id)) continue;
      results.push({
        id: `eval-user-${t.id}`,
        kind: "intervenant_evaluation_due",
        label: "Évaluation annuelle de l'intervenant à réaliser (indicateurs 21-22)",
        contactName: t.name || t.email,
        since: now,
        href: "/team?tab=evaluations",
        overdue: false,
      });
    }
    for (const s of activeSubs) {
      if (evaluatedSubIds.has(s.id)) continue;
      results.push({
        id: `eval-sub-${s.id}`,
        kind: "intervenant_evaluation_due",
        label: "Évaluation annuelle de l'intervenant à réaliser (indicateurs 21-22)",
        contactName: s.name,
        since: now,
        href: "/team?tab=evaluations",
        overdue: false,
      });
    }
  }

  return results
    .filter((t) => !dismissedKeys.has(`${t.kind}:${t.id}`))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.since.getTime() - b.since.getTime();
    });
}
