import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, canManageSessionInvitations } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { InviteComposer } from "@/components/InviteComposer";

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

function mapLinkFor(location: string | null) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
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
        },
      },
    },
  });
  if (!session) notFound();
  // Trainers only see their own sessions' detail page — SALES/ADMIN_MANAGER
  // "limited" access still means the whole org's schedule (see /planning),
  // this restriction is specifically the "own sessions" one from spec §2.
  if (auth.role === Role.TRAINER && session.trainerId !== auth.userId) redirect("/planning");

  const canManage = canManageSessionInvitations(auth.role, auth.userId, session);
  const isRemote = session.format === "REMOTE" || session.format === "HYBRID";
  const isInPerson = session.format === "IN_PERSON" || session.format === "HYBRID";
  const mapLink = isInPerson ? mapLinkFor(session.location) : null;

  return (
    <>
      <PageHeader title={session.course.title} subtitle={`${format(session.startsAt, "EEEE d MMMM yyyy", { locale: fr })} · ${FORMAT_LABELS[session.format]}`} />
      <div className="p-8 flex flex-col gap-5 max-w-3xl">
        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center gap-6 text-[12.5px]">
            <div>
              <div className="text-slate mb-1">Horaires</div>
              <div className="text-ink font-medium">
                {format(session.startsAt, "HH:mm")}–{format(session.endsAt, "HH:mm")}
              </div>
            </div>
            <div>
              <div className="text-slate mb-1">Formateur</div>
              <div className="text-ink font-medium">{session.trainer?.name ?? "À assigner"}</div>
            </div>
            <div>
              <div className="text-slate mb-1">Lieu</div>
              <div className="text-ink font-medium">{session.location ?? "Non renseigné"}</div>
            </div>
            <div>
              <div className="text-slate mb-1">Places</div>
              <div className="text-ink font-medium">
                {session.dossiers.length}/{session.capacity}
              </div>
            </div>
          </div>

          {(isRemote || isInPerson) && (
            <div className="mt-4 pt-4 border-t border-line flex flex-col gap-2 text-[12.5px]">
              {isRemote && (
                <div className="flex items-center gap-2">
                  <Pill tone="neutral">Visio</Pill>
                  {session.meetingLink ? (
                    <a href={session.meetingLink} target="_blank" rel="noreferrer" className="text-ink underline decoration-line hover:decoration-ink truncate">
                      {session.meetingLink}
                    </a>
                  ) : (
                    <span className="text-slate">Généré automatiquement au premier envoi d&apos;invitation</span>
                  )}
                </div>
              )}
              {isInPerson && (
                <div className="flex items-center gap-2">
                  <Pill tone="neutral">Lieu</Pill>
                  {mapLink ? (
                    <a href={mapLink} target="_blank" rel="noreferrer" className="text-ink underline decoration-line hover:decoration-ink">
                      Voir l&apos;itinéraire
                    </a>
                  ) : (
                    <span className="text-slate">Adresse non renseignée sur la session</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Apprenants inscrits ({session.dossiers.length})</div>
          <div className="flex flex-col gap-2">
            {session.dossiers.map((d) => {
              const lastInvitation = d.invitations[0];
              return (
                <details key={d.id} className="border border-line rounded-md group">
                  <summary className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer list-none">
                    <div className="flex-1 text-[13px] text-ink font-medium">
                      {d.contact.firstName} {d.contact.lastName}
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
                    {canManage ? (
                      <InviteComposer
                        sessionId={session.id}
                        dossierId={d.id}
                        isRemote={isRemote}
                        isInPerson={isInPerson}
                        meetingLink={session.meetingLink}
                        mapLink={mapLink}
                        libraryDocuments={d.documents.map((doc) => ({ id: doc.id, title: doc.title }))}
                        alreadyInvited={Boolean(lastInvitation)}
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

        <div className="text-[11.5px] text-slate">
          L&apos;envoi d&apos;email n&apos;est pas encore branché (spec §3 prévoit Brevo) — l&apos;invitation est
          enregistrée avec son lien et ses pièces jointes, mais aucun email n&apos;est réellement délivré à
          l&apos;apprenant pour l&apos;instant.
        </div>
      </div>
    </>
  );
}
