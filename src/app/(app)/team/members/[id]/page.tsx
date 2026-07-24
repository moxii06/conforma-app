import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, ROLE_LABELS } from "@/lib/tenant";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MemberRoleSelect } from "@/components/MemberRoleSelect";
import { EditMemberForm } from "@/components/EditMemberForm";
import { DeleteMemberButton } from "@/components/DeleteMemberButton";
import { AddMemberDocumentForm } from "@/components/AddMemberDocumentForm";
import { CATEGORY_LABELS } from "@/lib/documentCategories";

export default async function MemberRecordPage({ params }: { params: { id: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "team") !== "full") redirect("/dashboard");

  const member = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      trainerSessions: { include: { course: true }, orderBy: { startsAt: "desc" }, take: 10 },
      responsibleForCourses: { orderBy: { title: "asc" } },
      subcontractorRecord: true,
    },
  });
  if (!member) notFound();

  return (
    <>
      <PageHeader title={member.name} subtitle={member.email} />
      <div className="p-8 flex flex-col gap-5 max-w-3xl">
        <Link href="/team" className="text-[12px] text-slate hover:text-ink w-fit">
          ← Retour à l&apos;équipe
        </Link>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-semibold text-ink">Informations</div>
            <div className="flex items-center gap-3">
              <EditMemberForm memberId={member.id} initial={{ name: member.name, email: member.email }} />
              <DeleteMemberButton memberId={member.id} memberName={member.name} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Rôle</div>
              <MemberRoleSelect memberId={member.id} role={member.role} />
            </div>
            <div>
              <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Statut</div>
              <Pill tone={member.status === "active" ? "good" : "warn"}>{member.status === "active" ? "Actif" : "Invité"}</Pill>
            </div>
            <div>
              <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Membre depuis</div>
              <div className="text-ink">{format(member.createdAt, "d MMM yyyy", { locale: fr })}</div>
            </div>
            {member.subcontractorRecord && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Fiche sous-traitant liée</div>
                <Link href={`/team/subcontractors/${member.subcontractorRecord.id}`} className="text-ink underline decoration-line hover:decoration-ink">
                  {member.subcontractorRecord.name}
                </Link>
              </div>
            )}
          </div>
        </div>

        {member.responsibleForCourses.length > 0 && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3">Formations dont il/elle est responsable</div>
            <div className="flex flex-col gap-1">
              {member.responsibleForCourses.map((c) => (
                <Link key={c.id} href={`/formations/${c.id}`} className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink w-fit">
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {member.trainerSessions.length > 0 && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3">Sessions animées récemment</div>
            <div className="flex flex-col gap-1">
              {member.trainerSessions.map((s) => (
                <div key={s.id} className="text-[12.5px] text-ink">
                  {s.course.title} — {format(s.startsAt, "d MMM yyyy", { locale: fr })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Documents liés ({member.documents.length})</div>
          {member.documents.length > 0 ? (
            <div className="flex flex-col gap-1">
              {member.documents.map((doc) => (
                <a key={doc.id} href={doc.fileUrl ?? "#"} target="_blank" rel="noreferrer" className="text-[12px] text-ink underline decoration-line hover:decoration-ink w-fit">
                  {CATEGORY_LABELS[doc.category] ?? doc.category} — {doc.title}
                </a>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-slate">Aucun document.</div>
          )}
          <AddMemberDocumentForm memberId={member.id} />
        </div>
      </div>
    </>
  );
}
