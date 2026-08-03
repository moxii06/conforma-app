import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, EmptyState, Button } from "@/components/ui";
import Link from "next/link";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { SearchInput } from "@/components/SearchInput";
import { DossierStatusFilter } from "@/components/DossierStatusFilter";
import { Pagination } from "@/components/Pagination";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown } from "lucide-react";

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

  // One card per LEARNER, not per dossier — a repeat learner (several
  // formations over time) used to appear as several disconnected rows,
  // same name, no visible link between them (client feedback). Paginating
  // over distinct contacts (rather than dossiers) needs two passes: which
  // contacts match, on this page, in the right order (distinct + orderBy
  // picks each contact's most-recent-dossier row as the representative for
  // ordering) — then every dossier those specific contacts actually have,
  // unfiltered by the status filter, so a learner matched by ONE overdue
  // formation still shows their complete picture, not just that one row.
  const [pageContactRows, allMatchingGroups] = await Promise.all([
    prisma.dossier.findMany({
      where,
      select: { contactId: true },
      distinct: ["contactId"],
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.dossier.groupBy({ by: ["contactId"], where }),
  ]);
  const total = allMatchingGroups.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const contactIds = pageContactRows.map((r) => r.contactId);

  const dossiers = contactIds.length
    ? await prisma.dossier.findMany({
        where: { organizationId, contactId: { in: contactIds } },
        include: { contact: true, session: { include: { course: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const dossiersByContact = new Map<string, typeof dossiers>();
  for (const d of dossiers) {
    const arr = dossiersByContact.get(d.contactId);
    if (arr) arr.push(d);
    else dossiersByContact.set(d.contactId, [d]);
  }
  // contactIds carries the page's order (each contact's most recent
  // dossier, most-recent-first) — re-derive the learner list from it
  // rather than from dossiersByContact's insertion order, which follows
  // the second query's own ordering instead.
  const learnerGroups = contactIds
    .map((id) => dossiersByContact.get(id))
    .filter((group): group is NonNullable<typeof group> => Boolean(group?.length))
    .map((group) => ({ contact: group[0].contact, dossiers: group }));

  return (
    <>
      {/* Le sous-titre expliquait une table de jointure à un dirigeant :
          « Un dossier = un contact inscrit à une session ». Il dit
          maintenant à quoi l'écran sert, pas comment il est modélisé. */}
      <PageHeader
        title="Dossiers apprenants"
        subtitle="Une ligne par apprenant inscrit — suivez où en est chacun d'eux"
      />
      <div className="p-8 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <SearchInput placeholder="Rechercher un apprenant (nom, email)…" />
          <DossierStatusFilter />
          <div className="text-[12px] text-slate">{total} apprenant{total > 1 ? "s" : ""}</div>
        </div>
        <div className="flex flex-col gap-2">
          {learnerGroups.map(({ contact, dossiers: learnerDossiers }) => (
            <details key={contact.id} open className="group bg-white border border-line rounded-card overflow-hidden">
              <summary className="px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer list-none hover:bg-mist">
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar initials={`${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase()} />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-ink truncate">
                      {contact.firstName} {contact.lastName}
                    </div>
                    <div className="text-[12px] text-slate mt-0.5 truncate">{contact.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 text-slate">
                  <span className="text-[11.5px]">
                    {learnerDossiers.length} formation{learnerDossiers.length > 1 ? "s" : ""}
                  </span>
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-line divide-y divide-line">
                {learnerDossiers.map((d) => {
                  const doneCount = [d.needsAssessmentDone, d.contractSigned, d.convocationSent, d.evaluationHotDone, d.evaluationColdDone].filter(
                    Boolean
                  ).length;
                  // Same real signal as the dossier page's checklist: a fixed-date
                  // session already started without its convocation sent. ROLLING
                  // sessions carry placeholder dates — never "late" on this basis.
                  const convocationOverdue = d.session.mode === "FIXED_DATE" && !d.convocationSent && d.session.startsAt <= new Date();
                  return (
                    <Link
                      key={d.id}
                      href={`/dossiers/${d.id}`}
                      className="pl-14 pr-5 py-3 flex items-center justify-between gap-4 hover:bg-mist"
                    >
                      <div className="min-w-0 text-[12.5px] text-ink truncate">
                        {d.session.course.title} ·{" "}
                        <span className="text-slate">
                          {d.session.mode === "ROLLING" ? "en continu" : format(d.session.startsAt, "d MMM yyyy", { locale: fr })}
                        </span>
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
              </div>
            </details>
          ))}
          {learnerGroups.length === 0 && (
            q ? (
              <div className="text-[12.5px] text-slate">Aucun apprenant ne correspond à cette recherche.</div>
            ) : (
              <EmptyState
                title="Aucun dossier pour l'instant"
                description="Un dossier apparaît automatiquement dès qu'un apprenant est inscrit à une session — retrouvez vos formations dans le catalogue pour inscrire le premier."
                action={<Button href="/formations" size="sm">Aller au catalogue</Button>}
              />
            )
          )}
        </div>
        <Pagination basePath="/dossiers" searchParams={{ q, status: searchParams.status, page: searchParams.page }} page={page} totalPages={totalPages} />
      </div>
    </>
  );
}
