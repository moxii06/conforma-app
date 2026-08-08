import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, InfoRow, ContextBanner, Button, initialsOf } from "@/components/ui";
import { requireSessionContext, can, canManageSessionInvitations } from "@/lib/tenant";
import { templateCourseFilter, sortTemplatesForCourse } from "@/lib/templateScope";
import { CATEGORIES_FOURNISSEUR } from "@/lib/documentAudience";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PenLine, Activity } from "lucide-react";
import { Role } from "@prisma/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { InviteComposer } from "@/components/InviteComposer";
import { EditSessionForm } from "@/components/EditSessionForm";
import { SessionDaysForm } from "@/components/SessionDaysForm";
import { ValidateSessionButton } from "@/components/ValidateSessionButton";
import { EnrollIntoSessionPanel } from "@/components/EnrollIntoSessionPanel";
import { GenerateCertificateButton } from "@/components/GenerateCertificateButton";
import { CancelSessionButton } from "@/components/CancelSessionButton";
import { ArchiveSessionButton } from "@/components/ArchiveSessionButton";
import { buildSessionClosing, closingTitle } from "@/lib/sessionClosing";
import { SendBulkDocumentDialog } from "@/components/SendBulkDocumentDialog";
import { CloreDossiersButton } from "@/components/CloreDossiersButton";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SessionParcoursRules } from "@/components/SessionParcoursRules";
import { SessionAteliersPanel } from "@/components/SessionAteliersPanel";

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

function formatAttendanceDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Un atelier tient sur une journée dans l'immense majorité des cas ; on ne
 *  répète la date de fin que lorsqu'elle diffère vraiment. */
function libelleCreneauAtelier(debut: Date, fin: Date) {
  if (debut.toDateString() === fin.toDateString()) {
    return `${format(debut, "EEEE d MMMM yyyy", { locale: fr })} · ${format(debut, "HH:mm")}–${format(fin, "HH:mm")}`;
  }
  return `${format(debut, "d MMM yyyy HH:mm", { locale: fr })} → ${format(fin, "d MMM yyyy HH:mm", { locale: fr })}`;
}

function mapLinkFor(location: string | null) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default async function SessionDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireSessionContext();
  if (can(auth.roles, "planning") === "none") redirect("/dashboard");

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: {
      course: true,
      trainer: true,
      dossiers: {
        include: {
          contact: true,
          documents: true,
          invitations: { orderBy: { sentAt: "desc" }, take: 1 },
          virtualClassAttendances: { where: { session: { id: params.id } } },
          // Émargement : les signatures de CETTE session uniquement. Un
          // apprenant peut suivre plusieurs sessions, ses feuilles ne se
          // mélangent pas.
          attendanceEntries: { where: { sessionDay: { sessionId: params.id } }, select: { id: true } },
        },
      },
      days: {
        orderBy: { order: "asc" },
        select: { id: true, date: true, morningHours: true, afternoonHours: true, attendance: { select: { id: true } } },
      },
      // Les rendez-vous ponctuels de la session. Les annulés restent de la
      // partie : des gens s'y étaient inscrits, ils doivent continuer à les
      // voir barrés plutôt que de les voir disparaître.
      ateliers: {
        orderBy: { startsAt: "asc" },
        include: { participants: { select: { dossierId: true, presentAt: true } } },
      },
    },
  });
  if (!session) notFound();
  // Trainers only see their own sessions' detail page — SALES/ADMIN_MANAGER
  // "limited" access still means the whole org's schedule (see /planning),
  // this restriction is specifically the "own sessions" one from spec §2.
  if (auth.role === Role.TRAINER && session.trainerId !== auth.userId) redirect("/planning");

  const canManage = canManageSessionInvitations(auth.roles, auth.userId, session);
  const canEdit = can(auth.roles, "planning") === "full";
  // Même règle que l'émargement (où ce formulaire vivait jusqu'ici) : qui
  // mène la session en salle peut aussi en corriger les heures, pas
  // seulement qui peut éditer la fiche (canEdit, réservé au "full").
  const canEditDays = can(auth.roles, "planning") !== "none";
  const isRemote = session.format === "REMOTE" || session.format === "HYBRID";
  const isInPerson = session.format === "IN_PERSON" || session.format === "HYBRID";
  const mapLink = isInPerson ? mapLinkFor(session.location) : null;
  const isPast = session.endsAt < new Date();
  const isCancelled = session.status === "CANCELLED";
  const isManuallyArchived = Boolean(session.archivedAt);
  // Past or cancelled: the roster is frozen, no more editing/enrolling/inviting.
  const isReadOnly = isPast || isCancelled;
  const isValidated = session.status === "VALIDATED";
  const isFull = session.dossiers.length >= session.capacity;
  // Une formation en continu n'a ni cohorte ni demi-journées : l'émargement
  // et les journées de session n'ont rien à y faire, et sa réalisation se
  // justifie par le relevé d'activité (voir lib/activityReport.ts).
  const isRolling = session.mode === "ROLLING";
  const hasElearning = (await prisma.elearningModule.count({ where: { courseId: session.courseId } })) > 0;
  // Combien de dossiers de cette promotion sont encore ouverts — c'est ce
  // nombre que porte le bouton de clôture, pour qu'il dise exactement ce
  // qu'il va faire plutôt qu'un « Clôturer » ambigu.
  const dossiersOuverts = session.dossiers.filter((d) => d.archivedAt === null).length;
  // Combien de règles du parcours sont réglées POUR CETTE SESSION plutôt
  // qu'héritées de la formation. Le nombre est porté par la section repliée :
  // sans lui, rien ne distingue une session aux réglages standards d'une
  // session où quelqu'un a bloqué l'accès pendant la rétractation.
  const reglagesPropresSession = [
    session.sequentialUnlock,
    session.allowVideoSkip,
    session.withdrawalAccessPolicy,
    session.contractSigningMode,
  ].filter((valeur) => valeur !== null).length;

  // QW6 — les preuves du parcours, apprenant par apprenant. Le calcul vit
  // dans src/lib/sessionClosing.ts (testé) : c'est lui qui sait qu'une
  // preuve absente n'a pas le même sens avant et après son échéance.
  const halfDaysExpected = session.days.reduce(
    (sum, d) => sum + (d.morningHours ? 1 : 0) + (d.afternoonHours ? 1 : 0),
    0,
  );
  const closing = buildSessionClosing(
    session.dossiers.map((d) => ({
      dossierId: d.id,
      contactName: `${d.contact.firstName} ${d.contact.lastName}`,
      needsAssessmentDone: d.needsAssessmentDone,
      contractSigned: d.contractSigned,
      convocationSent: d.convocationSent,
      evaluationHotDone: d.evaluationHotDone,
      evaluationColdDone: d.evaluationColdDone,
      // Les deux origines comptent : une formation sans e-learning délivre
      // une attestation de fin de formation, pas un certificat LMS. Ne
      // reconnaître que la seconde affichait « Attestation » en rouge à vie
      // sur toutes les sessions en présentiel.
      certificateIssued: d.documents.some(
        (doc) => doc.templateOrigin === "lms_certificate" || doc.templateOrigin === "attendance_certificate",
      ),
      halfDaysSigned: d.attendanceEntries.length,
      halfDaysExpected,
    })),
    session.startsAt,
    session.endsAt,
    new Date(),
  );

  // Client feedback: staff need a heads-up when a learner already has other
  // active formations, to avoid double-booking or duplicated outreach.
  //
  // Réservé aux rôles qui pilotent réellement le remplissage : un formateur
  // n'a pas à savoir ce que ses stagiaires suivent PAR AILLEURS chez le même
  // organisme — et un sous-traitant se connecte avec ce rôle. La requête
  // elle-même est sautée, pas seulement son affichage.
  const canSeeOtherFormations = can(auth.roles, "dossiers") === "full";
  const contactIds = canSeeOtherFormations ? session.dossiers.map((d) => d.contactId) : [];
  const otherDossiersByContact = contactIds.length
    ? await prisma.dossier.findMany({
        where: { contactId: { in: contactIds }, sessionId: { not: session.id }, organizationId: auth.organizationId },
        include: { session: { include: { course: true } } },
      })
    : [];
  const otherFormationsByContactId = new Map<string, { dossierId: string; courseTitle: string; startsAt: Date }[]>();
  for (const d of otherDossiersByContact) {
    const list = otherFormationsByContactId.get(d.contactId) ?? [];
    list.push({ dossierId: d.id, courseTitle: d.session.course.title, startsAt: d.session.startsAt });
    otherFormationsByContactId.set(d.contactId, list);
  }

  const trainers = canEdit
    ? await prisma.user.findMany({ where: { organizationId: auth.organizationId, role: Role.TRAINER }, orderBy: { name: "asc" } })
    : [];

  const matchingOpportunities = canEdit
    ? await prisma.opportunity.findMany({
        where: { organizationId: auth.organizationId, stage: "CONTRACT_SIGNED", courseOfInterestId: session.courseId },
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Chargée aussi pour `canEdit` (et plus seulement `canManage`) : les règles
  // du parcours ci-dessous ont besoin du réglage de rétractation de
  // l'organisme, dernier échelon d'héritage quand ni la session ni la
  // formation ne disent rien. Une seule requête pour les deux usages.
  const organization =
    canManage || canEdit ? await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }) : null;
  // Les modèles propres à la formation de cette session passent devant, et
  // ceux d'une autre formation ne sont pas proposés du tout — voir
  // lib/templateScope.ts.
  const documentTemplates = canManage
    ? sortTemplatesForCourse(
        await prisma.documentTemplate.findMany({
          where: {
            AND: [
              { OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
              templateCourseFilter(session.courseId),
            ],
            // Écran client : pas de document fournisseur — voir
            // lib/documentAudience.ts.
            category: { notIn: CATEGORIES_FOURNISSEUR },
          },
          select: { id: true, title: true, category: true, courseId: true, organizationId: true, forkedFromId: true },
          orderBy: { title: "asc" },
        }),
        session.courseId,
      )
    : [];
  // Résolue côté serveur depuis le profil de l'expéditeur — voir
  // SignatureCheckbox et emailSignature.ts.
  const senderSignatureHtml = canManage
    ? (await prisma.user.findUnique({ where: { id: auth.userId }, select: { emailSignature: true } }))?.emailSignature ?? ""
    : "";
  const courseTitle = session.course.title;
  const dateLabel = format(session.startsAt, "d MMMM yyyy", { locale: fr });
  const timeLabel = format(session.startsAt, "HH:mm");
  const invitationDetails = isRemote
    ? `Lien de connexion : ${session.meetingLink ?? "généré à l'envoi"}`
    : `Lieu : ${session.location ?? "communiqué séparément"}`;
  function defaultConvocationBody(firstName: string) {
    return `Bonjour ${firstName},\n\nVous êtes convoqué(e) à la session "${courseTitle}" le ${dateLabel} à ${timeLabel}.\n\n${invitationDetails}\n\nÀ bientôt,\nL'équipe ${organization?.name ?? ""}`;
  }
  const defaultConvocationSubject = `Convocation — ${courseTitle} du ${dateLabel}`;

  const statusPill = (
    <Pill tone={isCancelled ? "danger" : isManuallyArchived ? "neutral" : isPast ? "warn" : isValidated ? "good" : "warn"}>
      {isCancelled ? "Annulée" : isManuallyArchived ? "Archivée" : isPast ? "Terminée" : isValidated ? "Validée" : "Brouillon"}
    </Pill>
  );
  const courseInitials = initialsOf(session.course.title);

  return (
    <>
      <PageHeader title={session.course.title} subtitle={`${format(session.startsAt, "EEEE d MMMM yyyy", { locale: fr })} · ${FORMAT_LABELS[session.format]}`} />
      {isCancelled ? (
        <ContextBanner tone="danger">
          <strong className="font-semibold">Session annulée</strong> — la liste des inscrits est figée, aucune convocation ne peut partir.
        </ContextBanner>
      ) : !isValidated && !isPast ? (
        <ContextBanner tone="warn">
          <strong className="font-semibold">Session en brouillon</strong>{" "}— validez-la pour activer l&apos;envoi des convocations.
        </ContextBanner>
      ) : isPast && !isManuallyArchived ? (
        <ContextBanner tone="warn">
          <strong className="font-semibold">Session terminée</strong>{" "}— vérifiez la clôture ci-dessous avant d&apos;archiver.
        </ContextBanner>
      ) : null}
      <div className="p-8 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <div className="bg-white border border-line rounded-card p-5 lg:sticky lg:top-6">
          <Avatar initials={courseInitials} />
          <div className="font-display text-[18px] text-ink mt-3 leading-snug">{session.course.title}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {statusPill}
            {isFull && !isCancelled && <Pill tone="neutral">Complet</Pill>}
          </div>

          <div className="mt-4">
            <div className="text-[12px] text-slate mb-1">Places</div>
            <div className={`text-2xl font-mono font-semibold tabular-nums ${isFull && !isCancelled ? "text-rust" : "text-ink"}`}>
              {session.dossiers.length}/{session.capacity}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-line flex flex-col gap-2.5">
            <InfoRow label="Horaires">
              {format(session.startsAt, "HH:mm")}–{format(session.endsAt, "HH:mm")}
            </InfoRow>
            <InfoRow label="Formateur">{session.trainer?.name ?? "À assigner"}</InfoRow>
            <InfoRow label="Format">{FORMAT_LABELS[session.format]}</InfoRow>
            {isInPerson && (
              <InfoRow label="Lieu">
                {mapLink ? (
                  <a href={mapLink} target="_blank" rel="noreferrer" className="underline decoration-line hover:decoration-ink">
                    {session.location}
                  </a>
                ) : (
                  "Non renseigné"
                )}
              </InfoRow>
            )}
            {isRemote && (
              <InfoRow label="Visio">
                {session.meetingLink ? (
                  <a href={session.meetingLink} target="_blank" rel="noreferrer" className="underline decoration-line hover:decoration-ink break-all">
                    Lien de connexion
                  </a>
                ) : (
                  "Généré au premier envoi"
                )}
              </InfoRow>
            )}
          </div>

          {canEdit && (
            <div className="mt-4 pt-4 border-t border-line flex items-center gap-3 flex-wrap">
              {!isReadOnly && (
                <>
                  <EditSessionForm
                    sessionId={session.id}
                    trainers={trainers}
                    initial={{
                      trainerId: session.trainerId,
                      startsAt: session.startsAt,
                      endsAt: session.endsAt,
                      format: session.format,
                      location: session.location,
                      capacity: session.capacity,
                      mode: session.mode,
                    }}
                  />
                  <ValidateSessionButton sessionId={session.id} isValidated={isValidated} />
                  <CancelSessionButton sessionId={session.id} />
                </>
              )}
              {/* Émarger n'a de sens que pour une cohorte datée : en
                  formation continue, chacun se connecte quand il veut, il
                  n'y a ni demi-journée ni groupe à faire signer. Proposer
                  une feuille de signature là-bas laissait croire qu'il
                  fallait la remplir — et détournait de la preuve qui
                  compte vraiment, le relevé d'activité.

                  Le lien d'émargement reste volontairement toujours visible
                  sur une session datée : il s'ouvre sur une tablette au
                  début du cours, et le chercher devant le groupe est
                  exactement le mauvais moment. */}
              {isRolling ? (
                <Button href={`/planning/${session.id}/releve`} size="sm">
                  <Activity size={13} /> Relevé d&apos;activité
                </Button>
              ) : (
                <>
                  <Button href={`/planning/${session.id}/emargement`} size="sm">
                    <PenLine size={13} /> Émargement
                  </Button>
                  {/* Une session datée peut être mixte : si la formation a
                      des modules en ligne, sa réalisation se justifie aussi
                      par eux. */}
                  {hasElearning && (
                    <Button href={`/planning/${session.id}/releve`} size="sm" variant="secondary">
                      <Activity size={13} /> Relevé d&apos;activité
                    </Button>
                  )}
                </>
              )}
              <ArchiveSessionButton sessionId={session.id} archived={isManuallyArchived} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
        {/* Les règles du parcours, réglées pour CETTE session et non pour
            toute la formation — une même formation se vend en salle un mois
            et à distance le suivant, et le droit de rétractation ne dépend
            pas du format mais de la façon dont le contrat a été conclu.
            Repliées par défaut : on n'y touche pas à chaque ouverture de la
            fiche, mais quand on y touche il faut tout le contexte. */}
        {canEdit && organization && (
          <CollapsibleSection
            title="Règles du parcours"
            badge={
              reglagesPropresSession > 0 ? (
                <Pill tone="warn">
                  {reglagesPropresSession} réglage{reglagesPropresSession > 1 ? "s" : ""} propre
                  {reglagesPropresSession > 1 ? "s" : ""} à la session
                </Pill>
              ) : (
                <Pill tone="neutral">Tout hérité de la formation</Pill>
              )
            }
          >
            <SessionParcoursRules
              sessionId={session.id}
              session={{
                sequentialUnlock: session.sequentialUnlock,
                allowVideoSkip: session.allowVideoSkip,
                withdrawalAccessPolicy: session.withdrawalAccessPolicy,
                contractSigningMode: session.contractSigningMode,
              }}
              formation={{
                sequentialUnlock: session.course.sequentialUnlock,
                allowVideoSkip: session.course.allowVideoSkip,
                withdrawalAccessPolicy: session.course.withdrawalAccessPolicy,
              }}
              organisme={{ withdrawalAccessPolicy: organization.withdrawalAccessPolicy }}
            />
          </CollapsibleSection>
        )}

        {/* Vivait uniquement sur l'écran d'émargement — donc il fallait
            ouvrir l'écran de signature tactile, pensé pour la salle, pour
            simplement déclarer une deuxième journée. Toujours présent là-bas
            pour la correction en direct ; ici pour la préparer en amont.

            Masqué en formation continue : les journées ne servent qu'à
            l'émargement et au calcul d'heures d'une cohorte datée. Sur une
            session sans cohorte, ce bloc invitait à saisir des demi-journées
            que personne ne signera jamais. */}
        {!isRolling && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Journées de la session</div>
          <SessionDaysForm
            sessionId={session.id}
            initialDays={session.days.map((d) => ({
              date: d.date.toISOString().slice(0, 10),
              morningHours: d.morningHours,
              afternoonHours: d.afternoonHours,
              locked: d.attendance.length > 0,
            }))}
            defaultDate={session.startsAt.toISOString().slice(0, 10)}
            canEdit={canEditDays}
          />
        </div>
        )}

        {/* Les ateliers ponctuels. Visibles sur toute session — un parcours
            daté peut avoir sa soutenance — mais c'est en formation continue
            qu'ils règlent un vrai manque : réunir une fois des apprenants
            qui n'ont, par construction, aucune date commune.

            Le bloc disparaît pour qui ne peut ni en créer ni en voir un :
            une carte vide n'apprend rien à un formateur. */}
        {(canEdit || session.ateliers.length > 0) && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">
            Ateliers ponctuels ({session.ateliers.length})
          </div>
          <SessionAteliersPanel
            sessionId={session.id}
            // Session annulée = tout est figé, comme les convocations et la
            // liste des inscrits plus haut. Une session simplement TERMINÉE
            // reste modifiable ici : c'est souvent après coup qu'on pointe
            // qui est réellement venu.
            canEdit={canEdit && !isCancelled}
            ateliers={session.ateliers.map((a) => ({
              id: a.id,
              titre: a.titre,
              description: a.description,
              startsAt: a.startsAt.toISOString(),
              endsAt: a.endsAt.toISOString(),
              // Le libellé est composé ici, comme toutes les dates de cette
              // page : une date mise en forme dans un composant client sort
              // dans le fuseau du serveur au premier rendu puis dans celui du
              // visiteur à l'hydratation, et les deux ne concordent pas.
              creneauLabel: libelleCreneauAtelier(a.startsAt, a.endsAt),
              format: a.format,
              location: a.location,
              meetingLink: a.meetingLink,
              capacity: a.capacity,
              annuleeAt: a.annuleeAt ? a.annuleeAt.toISOString() : null,
              // « Passé » est décidé ici et non au rendu du composant :
              // la même comparaison faite au rendu serveur puis à
              // l'hydratation peut donner deux résultats.
              passe: a.endsAt < new Date(),
              participants: a.participants.map((p) => ({
                dossierId: p.dossierId,
                presentAt: p.presentAt ? p.presentAt.toISOString() : null,
              })),
            }))}
            dossiers={session.dossiers.map((d) => ({
              id: d.id,
              nom: `${d.contact.firstName} ${d.contact.lastName}`,
            }))}
          />
        </div>
        )}

        {canEdit && !isReadOnly && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3.5">Ajouter un apprenant</div>
            <EnrollIntoSessionPanel
              sessionId={session.id}
              courseId={session.courseId}
              signedProspects={matchingOpportunities.map((o) => ({
                opportunityId: o.id,
                contactName: `${o.contact.firstName} ${o.contact.lastName}`,
              }))}
              enrolledContactIds={session.dossiers.map((d) => d.contactId)}
              isFull={isFull}
            />
          </div>
        )}

        {!isCancelled && closing.rows.length > 0 && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="text-[13.5px] font-semibold text-ink">{closingTitle(closing.stage)}</div>
              {canEdit && closing.stage === "past" && (
                <ArchiveSessionButton
                  sessionId={session.id}
                  archived={isManuallyArchived}
                  missingProofs={closing.missingDue}
                />
              )}
            </div>
            <div className="text-[12px] text-slate mb-3">
              {closing.missingDue === 0 ? (
                closing.stage === "upcoming" ? (
                  <>Rien n&apos;est encore exigible — la grille ci-dessous suit l&apos;avancement en temps réel.</>
                ) : (
                  <>
                    {closing.total} dossier{closing.total > 1 ? "s" : ""} à jour : aucune preuve exigible ne manque.
                  </>
                )
              ) : (
                <>
                  <span className="text-rust font-medium">
                    {closing.missingDue} preuve{closing.missingDue > 1 ? "s" : ""} manquante
                    {closing.missingDue > 1 ? "s" : ""}
                  </span>{" "}
                  sur {closing.total - closing.readyCount} dossier
                  {closing.total - closing.readyCount > 1 ? "s" : ""}
                  {closing.stage === "past"
                    ? " — à compléter avant d'archiver."
                    : " — encore rattrapables tant que la session n'est pas terminée."}
                </>
              )}
            </div>
            <div className="flex flex-col">
              {closing.rows.map((row) => (
                <div
                  key={row.dossierId}
                  className="flex items-center justify-between gap-3 py-1.5 border-t border-line first:border-t-0"
                >
                  <Link
                    href={`/dossiers/${row.dossierId}`}
                    className="text-[12px] text-ink min-w-0 truncate hover:underline decoration-line"
                  >
                    {row.contactName}
                  </Link>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {row.steps.map((step) => (
                      <span
                        key={step.key}
                        title={
                          step.detail ??
                          (step.done ? step.label : step.due ? `${step.label} — manquant` : `${step.label} — pas encore attendu`)
                        }
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          step.done
                            ? "bg-[#DEE5E0] text-sage"
                            : step.due
                              ? "bg-[#E9D8D3] text-rust"
                              : "bg-pebble text-slate"
                        }`}
                      >
                        {step.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
            <div className="text-[13.5px] font-semibold text-ink">Apprenants inscrits ({session.dossiers.length})</div>
            <div className="flex items-center gap-3.5">
              {/* Clôturer la promotion depuis la session : c'est l'unité qui
                  correspond au problème réel — une promotion entière qui
                  traîne dans les listes. Distinct de l'archivage de la
                  session elle-même, qui range le planning. */}
              {canManage &&
                (dossiersOuverts > 0 ? (
                  <CloreDossiersButton sessionId={session.id} nombre={dossiersOuverts} dejaClos={false} />
                ) : (
                  <CloreDossiersButton sessionId={session.id} nombre={session.dossiers.length} dejaClos={true} />
                ))}
              {canManage && (
                <SendBulkDocumentDialog
                  sessionId={session.id}
                  templates={documentTemplates}
                  recipients={session.dossiers.map((d) => ({ id: d.id, name: `${d.contact.firstName} ${d.contact.lastName}` }))}
                  signatureHtml={senderSignatureHtml}
                />
              )}
            </div>
          </div>
          {!isValidated && session.dossiers.length > 0 && (
            <div className="text-[12px] text-slate mb-3">
              Validez la session pour pouvoir envoyer les convocations.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {session.dossiers.map((d) => {
              const lastInvitation = d.invitations[0];
              const otherFormations = otherFormationsByContactId.get(d.contactId) ?? [];
              return (
                <details key={d.id} className="border border-line rounded-md group">
                  <summary className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer list-none">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/dossiers/${d.id}`}
                        className="text-[13px] text-ink font-medium hover:underline decoration-line"
                      >
                        {d.contact.firstName} {d.contact.lastName}
                      </Link>
                      {otherFormations.length > 0 && (
                        <div className="text-[11px] text-slate mt-0.5 truncate">
                          + {otherFormations.length} autre{otherFormations.length > 1 ? "s" : ""} formation
                          {otherFormations.length > 1 ? "s" : ""} : {otherFormations.map((f) => f.courseTitle).join(", ")}
                        </div>
                      )}
                    </div>
                    {lastInvitation ? (
                      <Pill tone="good">
                        Invité le {format(lastInvitation.sentAt, "d MMM", { locale: fr })}
                      </Pill>
                    ) : (
                      <Pill tone="warn">Non invité</Pill>
                    )}
                  </summary>
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-line">
                    {isRemote && (
                      <div className="pt-2 pb-1 text-[12px] text-ink flex items-center justify-between gap-3">
                        {d.virtualClassAttendances[0] ? (
                          <span className="text-slate">
                            Connecté le {format(d.virtualClassAttendances[0].joinedAt, "d MMM HH:mm", { locale: fr })} ·
                            {" "}
                            {formatAttendanceDuration(d.virtualClassAttendances[0].durationSeconds)} de présence
                            {!d.virtualClassAttendances[0].leftAt && " · en cours"}
                          </span>
                        ) : (
                          <span className="text-slate">Aucune connexion enregistrée</span>
                        )}
                        {d.virtualClassAttendances[0] && (
                          <GenerateCertificateButton sessionId={session.id} dossierId={d.id} />
                        )}
                      </div>
                    )}
                    {isCancelled ? (
                      <div className="text-[12px] text-slate pt-2">Session annulée — aucune convocation ne peut être envoyée.</div>
                    ) : !isValidated ? (
                      <div className="text-[12px] text-slate pt-2">
                        Session en brouillon — validez-la pour activer l&apos;envoi des convocations.
                      </div>
                    ) : canManage ? (
                      <InviteComposer
                        sessionId={session.id}
                        dossierId={d.id}
                        isRemote={isRemote}
                        isInPerson={isInPerson}
                        meetingLink={session.meetingLink}
                        mapLink={mapLink}
                        libraryDocuments={d.documents.map((doc) => ({ id: doc.id, title: doc.title }))}
                        alreadyInvited={Boolean(lastInvitation)}
                        defaultSubject={defaultConvocationSubject}
                        defaultBody={defaultConvocationBody(d.contact.firstName)}
                      />
                    ) : (
                      <div className="text-[12px] text-slate pt-2">
                        Seuls le formateur assigné et les administrateurs peuvent envoyer des invitations pour cette
                        session.
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
            {session.dossiers.length === 0 && <div className="text-[12.5px] text-slate">Aucun apprenant inscrit.</div>}
          </div>
        </div>
        </div>
        </div>
      </div>
    </>
  );
}
