import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { SearchInput } from "@/components/SearchInput";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 30;

export default async function DossiersPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none") redirect("/dashboard");
  // Spec §2: "Trainer: their own sessions" extends to the dossiers enrolled
  // in those sessions — a trainer manages their own learners, not the
  // whole org's.
  const ownerFilter: Prisma.DossierWhereInput = role === Role.TRAINER ? { session: { trainerId: userId } } : {};
  const q = searchParams.q?.trim();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const where: Prisma.DossierWhereInput = {
    organizationId,
    ...ownerFilter,
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
          <div className="text-[12px] text-slate">{total} dossier{total > 1 ? "s" : ""}</div>
        </div>
        <div className="flex flex-col gap-2">
          {dossiers.map((d) => (
            <Link
              key={d.id}
              href={`/dossiers/${d.id}`}
              className="bg-white border border-line rounded-card px-4.5 py-3.5 flex items-center gap-4 text-[13px] text-ink hover:border-ink-soft"
            >
              <div className="flex-1">
                {d.contact.firstName} {d.contact.lastName}
              </div>
              <div className="text-slate">{d.session.course.title}</div>
            </Link>
          ))}
          {dossiers.length === 0 && (
            <div className="text-[12.5px] text-slate">
              {q ? "Aucun dossier ne correspond à cette recherche." : "Aucun dossier."}
            </div>
          )}
        </div>
        <Pagination basePath="/dossiers" searchParams={{ q, page: searchParams.page }} page={page} totalPages={totalPages} />
      </div>
    </>
  );
}
