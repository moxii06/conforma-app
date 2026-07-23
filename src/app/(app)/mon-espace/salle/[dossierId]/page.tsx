import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { VirtualClassRoom } from "@/components/VirtualClassRoom";

const JOIN_WINDOW_BEFORE_MS = 15 * 60 * 1000;
const JOIN_WINDOW_AFTER_MS = 30 * 60 * 1000;

export default async function SalleVirtuellePage({ params }: { params: { dossierId: string } }) {
  const session = await requireSessionContext();
  if (session.role !== "LEARNER") redirect("/mon-espace");

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.dossierId, organizationId: session.organizationId, learnerUserId: session.userId },
    include: { session: { include: { course: true } } },
  });
  if (!dossier) notFound();

  const classSession = dossier.session;
  const isRemote = classSession.format === "REMOTE" || classSession.format === "HYBRID";
  if (!isRemote || !classSession.meetingLink) {
    return (
      <>
        <PageHeader title="Classe virtuelle" subtitle={classSession.course.title} />
        <div className="p-8 text-[12.5px] text-slate">Cette session n&apos;a pas de classe virtuelle.</div>
      </>
    );
  }

  const now = Date.now();
  const opensAt = classSession.startsAt.getTime() - JOIN_WINDOW_BEFORE_MS;
  const closesAt = classSession.endsAt.getTime() + JOIN_WINDOW_AFTER_MS;

  return (
    <>
      <PageHeader
        title="Classe virtuelle"
        subtitle={`${classSession.course.title} — ${format(classSession.startsAt, "EEEE d MMMM yyyy", { locale: fr })}`}
      />
      <div className="p-8 max-w-3xl">
        {now < opensAt ? (
          <div className="text-[12.5px] text-slate">
            La classe virtuelle ouvrira à partir de {format(new Date(opensAt), "HH:mm")}.
          </div>
        ) : now > closesAt ? (
          <div className="text-[12.5px] text-slate">Cette session est terminée.</div>
        ) : (
          <VirtualClassRoom sessionId={classSession.id} dossierId={dossier.id} meetingLink={classSession.meetingLink} />
        )}
      </div>
    </>
  );
}
