import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar } from "@/components/ui";
import Link from "next/link";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { SearchInput } from "@/components/SearchInput";
import { DossierStatusFilter } from "@/components/DossierStatusFilter";
import { Pagination } from "@/components/Pagination";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const PAGE_SIZE = 30;

const STATUS_FILTER_WHERE: Record<string, Prisma.DossierWhereInput> = {
  needs_assessment_missing: { needsAssessmentDone: false },
  contract_missing: { contractSigned: false },
  convocation_missing: { convocationSent: false },
  eval_hot_missing: { evaluationHotDone: false },
  eval_cold_missing: { evaluationColdDone: false },
};

export default async function DossiersPage(
  props: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }
) {
  const searchParams = await props.searchParams;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none") redirect("/dashboard");
  // Spec §2: "Trainer: their own sessions" extends to the dossiers enrolled
  // in those sessions — a trainer manages their own learners, not the
  // whole org's.
  const ownerFilter: Prisma.DossierWhereInput = role === Role.TRAINER ? { session: { trainerId: userId } } : {};
  const q = searchParams.q?.trim();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const statusFilter = searchParams.status && STATUS_FILTER_WHERE[searchParams.status] ? STATUS_FILTER_WHERE[searchParams.status] : {};

  const where: Prisma.DossierWhereInput = {
    organizationId,
    ...ownerFilter,
    ...statusFilter,
    ...(q
      ? {
          contact: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [dossiers, total] = await Promise.all([
    prisma.dossier.findMany({
      where,
      include: { contact: true, session: { include: { course: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.dossier.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Dossiers apprenants" subtitle="Un dossier = un contact inscrit à une session" />
      <div className="p-8 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <SearchInput placeholder="Rechercher un apprenant (nom, email)…" />
          <DossierStatusFilter />
          <div className="text-[12px] text-slate">{total} dossier{total > 1 ? "s" : ""}</div>
        </div>
        <div className="flex flex-col gap-2">
          {dossiers.map((d) => {
            const doneCount = [d.needsAssessmentDone, d.contractSigned, d.convocationSent, d.evaluationHotDone, d.evaluationColdDone].filter(Boolean).length;
            // Same real signal as the dossier page's checklist: a fixed-date
            // session already started without its convocation sent. ROLLING
            // sessions carry placeholder dates — never "late" on this basis.
            const convocationOverdue = d.session.mode === "FIXED_DATE" && !d.convocationSent && d.session.startsAt <= new Date();
            return (
              <Link
                key={d.id}
                href={`/dossiers/${d.id}`}
                className="bg-white border border-line rounded-card px-5 py-3.5 flex items-center justify-between gap-4 hover:border-ink-soft"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar initials={`${d.contact.firstName[0] ?? ""}${d.contact.lastName[0] ?? ""}`.toUpperCase()} />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-ink truncate">
                      {d.contact.firstName} {d.contact.lastName}
                    </div>
                    <div className="text-[12px] text-slate mt-0.5 truncate">
                      {d.session.course.title} ·{" "}
                      {d.session.mode === "ROLLING" ? "en continu" : format(d.session.startsAt, "d MMM yyyy", { locale: fr })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {convocationOverdue && <Pill tone="danger">Convocation en retard</Pill>}
                  {!d.contractSigned && !convocationOverdue && <Pill tone="warn">Convention à signer</Pill>}
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-pebble rounded-full overflow-hidden">
                      <div className="h-full bg-sage rounded-full" style={{ width: `${(doneCount / 5) * 100}%` }} />
                    </div>
                    <span className="text-[11.5px] text-slate tabular-nums font-mono">{doneCount}/5</span>
                  </div>
                </div>
              </Link>
            );
          })}
          {dossiers.length === 0 && (
            <div className="text-[12.5px] text-slate">
              {q ? "Aucun dossier ne correspond à cette recherche." : "Aucun dossier."}
            </div>
          )}
        </div>
        <Pagination basePath="/dossiers" searchParams={{ q, status: searchParams.status, page: searchParams.page }} page={page} totalPages={totalPages} />
      </div>
    </>
  );
}
