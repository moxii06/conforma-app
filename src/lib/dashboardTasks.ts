import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { addDays } from "date-fns";
import { canWriteRgpd, canAccessSecureReports } from "@/lib/tenant";
import { normaliserUrgence } from "@/lib/supportRequests";
import { getCourseCompletion } from "@/lib/lms";
import { AWAITING_FUNDER, isAwaitingFunderTooLong, isAgreementExpiringSoon } from "@/lib/funding";
// Un dossier clos ne doit plus rien réclamer : c'est la moitié du sens du
// mot « clôturer ». Voir dossierArchive.ts pour ce qui se tait et ce qui
// ne se tait jamais.
import { DOSSIERS_ACTIFS } from "@/lib/dossierArchive";
import type { DashboardTaskKind } from "@/lib/dashboardTaskThemes";
import { chargerEtatMediation } from "@/lib/mediationServeur";
import { rappelMediationDu } from "@/lib/mediationConsommation";
import {
  REMINDER_AFTER_DAYS,
  CONVOCATION_WARNING_DAYS,
  SUBCONTRACTOR_EXPIRY_WARNING_DAYS,
  FIXED_SESSION_PREP_WARNING_DAYS,
  ROLLING_PREP_DEADLINE_DAYS,
  ROLLING_DURATION_WARNING_RATIO,
  LEARNER_INACTIVITY_DAYS,
} from "@/lib/relanceDefaults";

// "Relances" thresholds — how long to wait before a pending step counts as
// needing a follow-up. Not spec-mandated numbers, just sane defaults; make
// these configurable per-org if that's ever asked for.
// Déplacés dans lib/relanceDefaults.ts — un module pur, donc lisible aussi
// par l'écran qui les ANNONCE (AutomationRulesPanel est un composant
// client, il ne peut pas importer ce fichier-ci qui tire Prisma). Le texte
// affiché et le moteur lisent désormais le même nombre ; recopier une valeur
// dans un libellé, c'est se garantir qu'il mentira au premier ajustement.
// Les commentaires expliquant chaque seuil ont suivi les constantes.

// Audit S7 (tenue en charge). Mesuré sur un organisme à 4 000 apprenants /
// 8 000 dossiers : cette fonction produisait 14 000 tâches, dont 11 334
// « en retard », et 19 Mo de données transférées — sur le tableau de bord
// ET, via la cloche, sur chaque page de l'application. Un organisme qui
// reprend son historique n'a coché aucune case dans Jalon : tout son passé
// remonte comme du travail en retard.
//
// Deux garde-fous, de natures différentes.
//
// L'HORIZON est un choix de fond : un dossier dont l'échéance est passée
// depuis plus d'un an n'est plus une tâche, c'est de l'archive. Le laisser
// dans la liste ne le rend pas plus susceptible d'être traité — il rend
// seulement invisible ce qui l'est. Un an est volontairement large (le
// garde-fou des relances automatiques, lui, est à six mois : ne pas
// envoyer d'email est plus prudent que ne pas afficher une ligne).
const HORIZON_TACHES_JOURS = 365;

// Le PLAFOND par famille borne ce qui est transféré. Mesuré : sur un
// organisme migré dont AUCUNE case n'est cochée, il mord vraiment — le
// jeu de volume produit 200 tâches, soit exactement deux familles au
// plafond. Ce n'est donc pas un simple filet de sécurité, et c'est
// pourquoi la troncature est remontée à l'appelant (voir `tronquee`)
// plutôt que passée sous silence.
//
// Les lots sont pris par date croissante et retriés à la fin : ce sont les
// plus anciens qui survivent, c'est-à-dire les plus en retard.
const MAX_TACHES_PAR_FAMILLE = 100;

// Plancher effectif : l'horizon, ou la date de reprise choisie par
// l'organisme si elle est plus récente. Appliqué DANS les requêtes, ce
// qui le rend exact quel que soit le volume — contrairement à un masquage
// ligne par ligne, qui ne pourrait porter que sur ce qui a déjà été
// calculé, donc au plus le plafond par famille.
function plancherTaches(reprise: Date | null): Date {
  const horizon = addDays(new Date(), -HORIZON_TACHES_JOURS);
  return reprise && reprise > horizon ? reprise : horizon;
}

export type DashboardTask = {
  id: string;
  // L'union se DÉDUIT des piles de dashboardTaskThemes.ts, qui est
  // désormais le vocabulaire : un type de tâche nouveau ne compile pas tant
  // qu'il n'a pas été rangé dans une pile. La liste était auparavant écrite
  // ici et recopiée là-bas ; la seconde pouvait donc en oublier un, qui
  // tombait alors en silence dans « Dossiers à compléter ».
  kind: DashboardTaskKind;
  label: string;
  contactName: string;
  /** La date de référence de la tâche, quel qu'en soit le sens. */
  since: Date;
  /**
   * Date avant laquelle il faut agir, quand la tâche en a une.
   *
   * `since` portait deux sens incompatibles selon le kind : « en attente
   * depuis le 3 avril » pour une relance, mais « à faire avant le 3 avril »
   * pour une échéance. Les trier ensemble du plus ancien au plus récent
   * envoyait toute échéance à venir en fin de liste — l'audit Qualiopi dans
   * trois semaines passait derrière un recueil des besoins relancé il y a
   * trois mois, alors que seul le premier a une date après laquelle il est
   * trop tard. `dueAt` isole ce second sens ; `since` garde sa valeur.
   */
  dueAt?: Date;
  href: string;
  overdue: boolean;
};

/**
 * Trois familles, dans cet ordre : ce qui est déjà en retard, ce qui a une
 * échéance à venir, ce qui traîne sans échéance. À l'intérieur : le plus
 * en retard d'abord, puis l'échéance la plus proche, puis le plus ancien.
 *
 * Sans cette séparation, une convocation à envoyer pour après-demain ne
 * pouvait jamais remonter : sa date étant dans le futur, elle était par
 * construction « plus récente » que n'importe quelle relance en cours.
 */
export function compareDashboardTasks(a: DashboardTask, b: DashboardTask): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.overdue) return a.since.getTime() - b.since.getTime();
  if (Boolean(a.dueAt) !== Boolean(b.dueAt)) return a.dueAt ? -1 : 1;
  if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
  return a.since.getTime() - b.since.getTime();
}

// The dashboard's unified "what needs doing" list — originally just sales
// follow-ups (hence the old name, followUps.ts), grown to cover every
// "something is waiting on a human" signal across the app: pending
// relances, overdue money, RGPD deadlines/AI suggestions, and sessions
// stuck in draft with learners already enrolled. One sorted list instead
// of five separate widgets, per the dashboard-around-tasks/invoices/money
// rework. Scoped by role using the same ownership rules as the rest of the
// app: SALES only sees their own prospects' items, TRAINER only their own
// sessions, ADMIN_OF/ADMIN_MANAGER see everything they have module access to.
export type DashboardTasksResult = {
  tasks: DashboardTask[];
  /** Au moins une famille a atteint MAX_TACHES_PAR_FAMILLE : il en reste au-delà. */
  tronquee: boolean;
};

export async function getDashboardTasks(organizationId: string, role: Role, userId: string): Promise<DashboardTasksResult> {
  const threshold = addDays(new Date(), -REMINDER_AFTER_DAYS);
  const results: DashboardTask[] = [];
  // Familles ayant ramené exactement leur plafond — voir le retour.
  const famillesAuPlafond = new Set<string>();
  function noterSiPlafond(famille: string, lot: unknown[]) {
    if (lot.length >= MAX_TACHES_PAR_FAMILLE) famillesAuPlafond.add(famille);
  }

  // Tasks are recomputed live from dossier/invoice/etc. state on every load
  // — there's no row to mark done, so "ignorer" is tracked separately here
  // and filtered out just before returning.
  const [dismissals, organisation] = await Promise.all([
    prisma.dashboardTaskDismissal.findMany({
      where: { organizationId },
      select: { kind: true, entityId: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { tasksHiddenBefore: true },
    }),
  ]);
  // Plancher commun à toutes les familles : horizon, ou date de reprise si
  // l'organisme en a choisi une (voir Organization.tasksHiddenBefore).
  const plancher = plancherTaches(organisation.tasksHiddenBefore);
  const dismissedKeys = new Set(dismissals.map((d) => `${d.kind}:${d.entityId}`));

  const canSeeGeneral = role === Role.ADMIN_OF || role === Role.ADMIN_MANAGER;
  const canSeeSales = canSeeGeneral || role === Role.SALES;
  const canSeeTrainer = canSeeGeneral || role === Role.TRAINER;
  const canSeeRgpd = canWriteRgpd(role);

  // Audit P1 : « quand j'assigne à quelqu'un, ça fait quoi ? » — rien, avant.
  // L'assignation est maintenant une vraie tâche pour la personne visée, et
  // seulement pour elle : contrairement à tout le reste de cette fonction,
  // le filtre porte sur l'utilisateur et non sur son rôle. Un email traité
  // (rattaché à un contact) ou écarté sort de la liste tout seul.
  const assignedEmails = await prisma.emailMessage.findMany({
    where: { organizationId, assignedToUserId: userId, contactId: null, ignoredAt: null },
    select: { id: true, subject: true, fromName: true, fromAddress: true, receivedAt: true },
    orderBy: { receivedAt: "asc" },
    take: 50,
  });
  for (const m of assignedEmails) {
    results.push({
      id: m.id,
      kind: "email_assigned",
      label: `Email à traiter — ${m.subject || "(sans objet)"}`,
      contactName: m.fromName || m.fromAddress,
      since: m.receivedAt,
      href: "/inbox",
      overdue: false,
    });
  }

  // Même principe que les emails assignés ci-dessus, et pour la même raison :
  // assigner une demande RGPD à quelqu'un ne produisait rien chez cette
  // personne. Elle restait visible dans un onglet du registre, c'est-à-dire
  // nulle part — alors qu'une demande de droit a une échéance légale d'un
  // mois (art. 12(3)) et que l'assignation est censée être le moment où
  // quelqu'un devient responsable de la tenir.
  //
  // Filtrée sur l'UTILISATEUR et non sur son rôle, contrairement à presque
  // tout le reste de cette fonction : un formateur peut se voir assigner une
  // demande d'accès interne alors que `rgpd` lui est fermé. La tâche est à
  // lui, pas à son rôle.
  //
  // `status: { not: "closed" }` et non `"open"` : une demande en cours de
  // traitement reste due, et son échéance ne bouge pas.
  const demandesRgpdAssignees = await prisma.rightsRequest.findMany({
    where: {
      organizationId,
      assignedToUserId: userId,
      status: { not: "closed" },
      // Pas de plancher d'ancienneté ici, contrairement aux familles issues
      // des dossiers. Le plancher existe pour les volumes que la reprise
      // d'historique fait exploser ; une demande de droit ne s'importe pas,
      // il y en a quelques-unes par an, et une demande ancienne encore
      // ouverte n'est pas de l'archive — c'est un délai légal dépassé, la
      // dernière chose à faire disparaître d'une liste.
    },
    orderBy: { deadline: "asc" },
    take: MAX_TACHES_PAR_FAMILLE,
  });
  noterSiPlafond("rgpd_request_assigned", demandesRgpdAssignees);
  const maintenantRgpd = new Date();
  for (const r of demandesRgpdAssignees) {
    results.push({
      id: r.id,
      kind: "rgpd_request_assigned",
      label: `Demande RGPD qui vous est assignée — échéance ${r.deadline.toLocaleDateString("fr-FR")}`,
      contactName: r.personLabel,
      since: r.deadline,
      dueAt: r.deadline,
      href: "/rgpd?tab=droits",
      overdue: r.deadline < maintenantRgpd,
    });
  }

  // Réclamations et signalements confidentiels ADRESSÉS à cette personne.
  //
  // C'est ce qui donne un effet réel à l'assignation faite sur /support :
  // sans cela, désigner un responsable et cocher des destinataires ne
  // produisait rien nulle part, et la demande n'existait que pour qui pensait
  // à rouvrir l'écran. Aucune table de notification n'est inventée pour
  // autant — les notifications de Jalon sont calculées à la volée, ici, et la
  // cloche du header lit cette même liste (voir /api/notifications).
  //
  // Filtré sur l'UTILISATEUR et non sur son rôle, comme les emails et les
  // demandes RGPD ci-dessus. Deux façons d'être concerné, qui ne disent pas la
  // même chose et que le libellé distingue : RESPONSABLE (assignedToUserId) ou
  // simplement PRÉVENU (notifyUserIds).
  //
  // Une demande traitée ou archivée sort de la liste d'elle-même : il n'y a
  // rien de plus à « marquer fait ».
  const maintenantSupport = new Date();
  const reclamationsAdressees = await prisma.complaint.findMany({
    where: {
      organizationId,
      archivedAt: null,
      status: { not: "resolved" },
      OR: [{ assignedToUserId: userId }, { notifyUserIds: { has: userId } }],
    },
    select: { id: true, subject: true, submittedByName: true, assignedToUserId: true, assigneeDeadline: true, urgency: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: MAX_TACHES_PAR_FAMILLE,
  });
  noterSiPlafond("support_request_assigned", reclamationsAdressees);
  for (const c of reclamationsAdressees) {
    const urgence = normaliserUrgence(c.urgency);
    const responsable = c.assignedToUserId === userId;
    results.push({
      id: c.id,
      kind: "support_request_assigned",
      label: `${urgence === "urgent" ? "Urgent — " : ""}${
        responsable ? "Réclamation à traiter" : "Réclamation à suivre (vous êtes prévenu)"
      } : ${c.subject}`,
      contactName: c.submittedByName,
      // L'échéance de traitement quand il y en a une, sinon la date de
      // réception : « en attente depuis le 3 avril » et « à faire avant le
      // 3 avril » ne se trient pas pareil (voir DashboardTask.dueAt).
      since: c.assigneeDeadline ?? c.createdAt,
      ...(c.assigneeDeadline ? { dueAt: c.assigneeDeadline } : {}),
      href: "/support",
      overdue: c.assigneeDeadline != null && c.assigneeDeadline < maintenantSupport,
    });
  }

  // Les signalements ne remontent QUE chez qui est habilité à les lire. Une
  // notification sans issue apprendrait à son destinataire qu'un signalement
  // existe sans lui permettre de l'ouvrir — la route PATCH refuse d'ailleurs
  // déjà de désigner quelqu'un qui n'y a pas accès (lib/supportAssignment.ts).
  if (canAccessSecureReports(role)) {
    const signalementsAdresses = await prisma.secureReport.findMany({
      where: {
        organizationId,
        archivedAt: null,
        status: { not: "closed" },
        OR: [{ assignedToUserId: userId }, { notifyUserIds: { has: userId } }],
      },
      select: { id: true, assignedToUserId: true, assigneeDeadline: true, urgency: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("support_request_assigned", signalementsAdresses);
    for (const r of signalementsAdresses) {
      const urgence = normaliserUrgence(r.urgency);
      const responsable = r.assignedToUserId === userId;
      results.push({
        id: r.id,
        kind: "support_request_assigned",
        // Jamais le contenu du signalement : cette ligne s'affiche dans la
        // cloche du header, donc sur n'importe quel écran, à la vue de
        // n'importe qui passe derrière.
        label: `${urgence === "urgent" ? "Urgent — " : ""}${
          responsable ? "Signalement confidentiel à traiter" : "Signalement confidentiel à suivre (vous êtes prévenu)"
        }`,
        contactName: `Reçu le ${r.createdAt.toLocaleDateString("fr-FR")}`,
        since: r.assigneeDeadline ?? r.createdAt,
        ...(r.assigneeDeadline ? { dueAt: r.assigneeDeadline } : {}),
        href: "/support",
        overdue: r.assigneeDeadline != null && r.assigneeDeadline < maintenantSupport,
      });
    }
  }

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
        ...DOSSIERS_ACTIFS,
        contact: { invoices: { some: { status: "PAID" } } },
        clientOutreaches: { none: { type: "platform_access" } },
        // Aucun événement ne fait sortir un dossier de ce lot : sans
        // horizon, tout l'historique payé y reste définitivement.
        createdAt: { gte: plancher },
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("platform_access_after_payment", paidAwaitingAccess);
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
        ...DOSSIERS_ACTIFS,
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
        dueAt: d.session.startsAt,
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
        ...DOSSIERS_ACTIFS,
        OR: [{ needsAssessmentDone: false }, { contractSigned: false }],
        session: role === Role.TRAINER ? { trainerId: userId } : undefined,
        createdAt: { gte: plancher },
      },
      include: { contact: true, session: true },
      orderBy: { createdAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("dossier_prep", incompleteDossiers);
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
        ...DOSSIERS_ACTIFS,
        accessDurationDays: { not: null },
        firstAccessedAt: { not: null, gte: plancher },
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
        dueAt: deadline,
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
        ...DOSSIERS_ACTIFS,
        firstAccessedAt: { not: null, gte: plancher },
        session: role === Role.TRAINER ? { trainerId: userId } : undefined,
      },
      include: {
        contact: true,
        session: { include: { course: { include: { elearningModules: { include: { quiz: true } } } } } },
        elearningProgress: true,
        quizAttempts: true,
      },
      orderBy: { firstAccessedAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("learner_inactive", startedDossiers);
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

  // Attestation à envoyer : l'apprenant a tout validé, et personne ne le
  // sait. Rien, jusqu'ici, ne signalait qu'une formation était arrivée à son
  // terme — l'attestation existait mais il fallait penser à aller la
  // chercher dossier par dossier. C'est l'exact symétrique du décrochage
  // ci-dessus : même population, condition inverse.
  //
  // Volontairement limité à l'e-learning arrivé à 100 %. Le présentiel a
  // aussi droit à son attestation (article L.6353-1), mais « la session est
  // finie et tout le monde a signé » est une autre requête, avec d'autres
  // faux positifs : ne pas la traiter est un choix, pas un oubli.
  if (canSeeTrainer) {
    const finis = await prisma.dossier.findMany({
      where: {
        organizationId,
        ...DOSSIERS_ACTIFS,
        firstAccessedAt: { not: null, gte: plancher },
        session: role === Role.TRAINER ? { trainerId: userId } : undefined,
        // Ce qui n'a pas encore été envoyé, et rien d'autre : une fois
        // l'attestation partie, la tâche disparaît d'elle-même.
        clientOutreaches: { none: { type: "certificate" } },
      },
      include: {
        contact: true,
        session: { include: { course: { include: { elearningModules: { include: { quiz: true } } } } } },
        elearningProgress: true,
        quizAttempts: true,
      },
      orderBy: { firstAccessedAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("certificate_to_send", finis);
    for (const d of finis) {
      const modules = d.session.course.elearningModules;
      if (modules.length === 0) continue;
      const { allCompleted } = getCourseCompletion(modules, d.elearningProgress, d.quizAttempts);
      if (!allCompleted) continue;

      // La date de référence est celle du dernier acte de l'apprenant : ce
      // qu'on veut lire, c'est « il a fini il y a trois semaines et il
      // attend toujours », pas la date d'inscription.
      const fini = d.elearningProgress.reduce<Date>((latest, p) => {
        const candidate = p.lastEventAt ?? p.assignedAt;
        return candidate > latest ? candidate : latest;
      }, d.firstAccessedAt!);

      results.push({
        id: d.id,
        kind: "certificate_to_send",
        label: "Formation terminée — attestation à envoyer",
        contactName: `${d.contact.firstName} ${d.contact.lastName}`,
        since: fini,
        href: `/dossiers/${d.id}`,
        // Pas de retard : l'apprenant a fini, c'est une bonne nouvelle à
        // traiter, pas une alerte. La marquer en rouge la mettrait au même
        // niveau qu'une facture impayée.
        overdue: false,
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
          ...DOSSIERS_ACTIFS,
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
        // Une facture importée d'un ancien outil et restée « envoyée »
        // faute d'avoir été rapprochée n'est pas une relance à faire
        // aujourd'hui — c'est une reprise de comptabilité.
        createdAt: { gte: plancher },
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("invoice_overdue", overdueInvoices);
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

    // Sessions delivered but never billed. This is the quietest way an OFP
    // loses money: nothing is late, because nothing was ever issued — so no
    // overdue-invoice alert can fire, and the CRM's "À facturer" column stays
    // empty because reaching TO_INVOICE only ever happened by hand.
    //
    // Marked overdue from day one on purpose: unlike a reminder that can wait
    // a week, unbilled delivered work is already a problem when it's noticed.
    const uninvoicedSessions = await prisma.session.findMany({
      where: {
        organizationId,
        endsAt: { lt: now, gte: plancher },
        status: { not: "CANCELLED" },
        archivedAt: null,
        dossiers: {
          // At least one enrolled learner with no real invoice. DRAFT doesn't
          // count — an unsent draft is exactly the state this is meant to
          // catch, not evidence that billing happened.
          some: { invoices: { none: { status: { not: "DRAFT" } } } },
        },
      },
      include: {
        course: { select: { title: true } },
        dossiers: {
          where: { invoices: { none: { status: { not: "DRAFT" } } } },
          include: { contact: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { endsAt: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("session_uninvoiced", uninvoicedSessions);
    for (const s of uninvoicedSessions) {
      const count = s.dossiers.length;
      results.push({
        id: s.id,
        kind: "session_uninvoiced",
        label: `Session terminée non facturée — ${count} apprenant${count > 1 ? "s" : ""} sans facture`,
        contactName: s.course.title,
        since: s.endsAt,
        href: `/planning/${s.id}`,
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
          dueAt: c.validUntil!,
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
        dueAt: s.startsAt,
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
        // Ce qui m'est assigné sort d'ici : la famille personnelle
        // ci-dessous le reprend avec un signal plus fort (« qui VOUS est
        // assignée »). Sans cette exclusion, la même demande apparaîtrait
        // deux fois à la même personne, sous deux libellés différents.
        //
        // Le OR explicite plutôt qu'un `not` : sur une colonne nullable, la
        // façon dont Prisma traite les NULL dans une négation a changé d'une
        // version à l'autre, et une demande non assignée qui disparaîtrait en
        // silence de la liste serait exactement le genre de régression
        // qu'aucun écran ne signale.
        where: {
          organizationId,
          status: "open",
          OR: [{ assignedToUserId: null }, { assignedToUserId: { not: userId } }],
        },
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
        dueAt: r.deadline,
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
        dueAt: soonest,
        href: "/team",
        overdue: soonest < now,
      });
    }
  }

  // Reconduction tacite d'un contrat de sous-traitance.
  //
  // Famille distincte de subcontractor_expiry juste au-dessus, et pour une
  // raison de fond : ce n'est pas la même date. Un contrat qui se reconduit
  // tout seul n'a pas d'échéance à surveiller — il a un PRÉAVIS. Passée la
  // date limite de dénonciation (contractEndDate - renewalNoticeDays),
  // l'organisme est engagé pour un tour de plus, qu'il l'ait voulu ou non ;
  // apprendre la nouvelle trente jours avant la fin du contrat, comme le
  // ferait l'autre famille, c'est l'apprendre trop tard.
  //
  // L'alerte s'ouvre donc UN MOIS AVANT LE PRÉAVIS, ce qui laisse le temps
  // d'arbitrer et d'écrire la lettre. Elle reste ensuite affichée jusqu'à la
  // fin du contrat, en retard : la reconduction acquise est un fait qui
  // change les prochains mois de l'organisme (budget, plan de charge), et
  // l'effacer au motif qu'il est trop tard reviendrait à masquer la
  // conséquence de l'oubli. Un rejet ponctuel la fait taire comme n'importe
  // quelle autre tâche (DashboardTaskDismissal).
  if (canSeeGeneral) {
    const now = new Date();
    const candidats = await prisma.subcontractor.findMany({
      where: {
        organizationId,
        status: "active",
        tacitRenewal: true,
        renewalNoticeDays: { not: null },
        // Un contrat déjà terminé ne se dénonce plus : soit il a été
        // reconduit et sa vraie date de fin n'est plus celle-ci (le schéma
        // n'en garde qu'une), soit il est éteint. Dans les deux cas c'est la
        // fiche qu'il faut corriger, et subcontractor_expiry le dit déjà.
        contractEndDate: { gte: now },
      },
      select: { id: true, name: true, contractEndDate: true, renewalNoticeDays: true },
      // Par échéance croissante : si le plafond mord, ce sont les préavis
      // les plus proches qui survivent.
      orderBy: { contractEndDate: "asc" },
      take: MAX_TACHES_PAR_FAMILLE,
    });
    noterSiPlafond("subcontractor_renewal_notice", candidats);
    for (const s of candidats) {
      if (!s.contractEndDate || s.renewalNoticeDays == null) continue;
      const dateDenonciation = addDays(s.contractEndDate, -s.renewalNoticeDays);
      // Un mois avant le préavis : c'est la fenêtre demandée, et rien avant.
      if (addDays(dateDenonciation, -30) > now) continue;
      const depasse = dateDenonciation < now;
      results.push({
        id: s.id,
        kind: "subcontractor_renewal_notice",
        label: depasse
          ? `Préavis de dénonciation dépassé — contrat reconduit jusqu'au ${s.contractEndDate.toLocaleDateString("fr-FR")}`
          : `Reconduction tacite — dénoncer avant le ${dateDenonciation.toLocaleDateString("fr-FR")} ou le contrat repart`,
        contactName: s.name,
        since: dateDenonciation,
        dueAt: dateDenonciation,
        href: `/team/subcontractors/${s.id}`,
        overdue: depasse,
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
        dueAt: orgQualiopi.qualiopiCertificateUntil,
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
        dueAt: orgQualiopi.nextAuditDate,
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

  // Le rappel d'adhésion à un médiateur de la consommation.
  //
  // Réservé au rôle qui peut y répondre — c'est une décision d'organisme, pas
  // une tâche d'équipe — et conditionné à un signal RÉEL de vente au
  // particulier : un organisme qui ne vend qu'à des entreprises n'est pas
  // tenu par l'art. L.612-1, et lui servir cette alerte tous les mois
  // décrédibiliserait toutes les autres. La règle complète, et le pourquoi
  // du report, sont dans lib/mediationConsommation.ts.
  if (role === Role.ADMIN_OF) {
    const etat = await chargerEtatMediation(organizationId);
    if (rappelMediationDu(etat, new Date())) {
      results.push({
        id: "mediation",
        kind: "mediator_missing",
        label: "Adhésion à un médiateur de la consommation à souscrire — obligatoire (art. L.612-1)",
        contactName: "Votre organisme",
        // `since` et non `dueAt` : il n'y a pas de date après laquelle il
        // serait trop tard, l'obligation est déjà née. La tâche se range
        // donc avec ce qui traîne, pas avec ce qui arrive à échéance.
        since: new Date(),
        href: "/profil#particuliers",
        overdue: false,
      });
    }
  }

  // La date de reprise s'applique aussi aux familles dont la requête n'est
  // pas bornée dans le temps (Qualiopi, RGPD, sous-traitants, sessions en
  // brouillon…) : là, le volume ne vient pas des apprenants, donc le filtre
  // en mémoire suffit et évite d'alourdir sept requêtes de plus.
  const reprise = organisation.tasksHiddenBefore;
  const tasks = results
    .filter((t) => !dismissedKeys.has(`${t.kind}:${t.id}`))
    .filter((t) => !reprise || t.since >= reprise)
    .sort(compareDashboardTasks);

  // Une famille au plafond signifie qu'il en reste au-delà. On le dit :
  // un compteur plafonné qui se lit comme un total est un mensonge, et
  // c'est exactement le défaut relevé ailleurs par l'audit (le journal des
  // automatisations affichait « 50 envois ces 30 derniers jours » quelle
  // que soit la réalité, parce qu'il comptait sur une fenêtre déjà
  // tronquée). Compter précisément coûterait une requête de plus par
  // famille pour une information que personne n'actionne — savoir qu'il y
  // en a « plus que ça » suffit.
  const tronquee = famillesAuPlafond.size > 0;

  return { tasks, tronquee };
}
