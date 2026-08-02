import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, InfoRow, ContextBanner, initialsOf } from "@/components/ui";
import { requireSessionContext, can, canManageSessionInvitations } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { Role } from "@prisma/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { InviteComposer } from "@/components/InviteComposer";
import { EditSessionForm } from "@/components/EditSessionForm";
import { SessionDaysForm } from "@/components/SessionDaysForm";
import { ValidateSessionButton } from "@/components/ValidateSessionButton";
import { EnrollProspectForm } from "@/components/EnrollProspectForm";
import { GenerateCertificateButton } from "@/components/GenerateCertificateButton";
import { CancelSessionButton } from "@/components/CancelSessionButton";
import { ArchiveSessionButton } from "@/components/ArchiveSessionButton";
import { buildSessionClosing, closingTitle } from "@/lib/sessionClosing";
import { SendBulkDocumentDialog } from "@/components/SendBulkDocumentDialog";

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

function mapLinkFor(location: string | null) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default async function SessionDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireSessionContext();
  if (can(auth.role, "planning") === "none") redirect("/dashboard");

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
    },
  });
  if (!session) notFound();
  // Trainers only see their own sessions' detail page — SALES/ADMIN_MANAGER
  // "limited" access still means the whole org's schedule (see /planning),
  // this restriction is specifically the "own sessions" one from spec §2.
  if (auth.role === Role.TRAINER && session.trainerId !== auth.userId) redirect("/planning");

  const canManage = canManageSessionInvitations(auth.role, auth.userId, session);
  const canEdit = can(auth.role, "planning") === "full";
  // Même règle que l'émargement (où ce formulaire vivait jusqu'ici) : qui
  // mène la session en salle peut aussi en corriger les heures, pas
  // seulement qui peut éditer la fiche (canEdit, réservé au "full").
  const canEditDays = can(auth.role, "planning") !== "none";
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
  const canSeeOtherFormations = can(auth.role, "dossiers") === "full";
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

  const organization = canManage ? await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }) : null;
  const documentTemplates = canManage
    ? await prisma.documentTemplate.findMany({
        where: { OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
        select: { id: true, title: true, category: true },
        orderBy: { title: "asc" },
      })
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
          <strong className="font-semibold">Session en brouillon</strong> — validez-la pour activer l&apos;envoi des convocations.
        </ContextBanner>
      ) : isPast && !isManuallyArchived ? (
        <ContextBanner tone="warn">
          <strong className="font-semibold">Session terminée</strong> — vérifiez la clôture ci-dessous avant d&apos;archiver.
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
                    }}
                  />
                  <ValidateSessionButton sessionId={session.id} isValidated={isValidated} />
                  <CancelSessionButton sessionId={session.id} />
                </>
              )}
              {/* Deliberately a plain, always-available link: this is opened
                  on a tablet at the start of a session, and hunting for it
                  in front of the group is exactly the wrong moment. */}
              <Link
                href={`/planning/${session.id}/emargement`}
                className="inline-flex items-center gap-1.5 bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft"
              >
                <PenLine size={13} /> Émargement
              </Link>
              <ArchiveSessionButton sessionId={session.id} archived={isManuallyArchived} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
        {/* Vivait uniquement sur l'écran d'émargement — donc il fallait
            ouvrir l'écran de signature tactile, pensé pour la salle, pour
            simplement déclarer une deuxième journée. Toujours présent là-bas
            pour la correction en direct ; ici pour la préparer en amont. */}
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

        {canEdit && !isReadOnly && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3.5">Ajouter un apprenant</div>
            <EnrollProspectForm
              sessionId={session.id}
              suggestions={matchingOpportunities.map((o) => ({
                opportunityId: o.id,
                contactName: `${o.contact.firstName} ${o.contact.lastName}`,
              }))}
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
                              ? "bg-[#F4E3DE] text-rust"
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
            {canManage && (
              <SendBulkDocumentDialog
                sessionId={session.id}
                templates={documentTemplates}
                recipients={session.dossiers.map((d) => ({ id: d.id, name: `${d.contact.firstName} ${d.contact.lastName}` }))}
                signatureHtml={senderSignatureHtml}
              />
            )}
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
