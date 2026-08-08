import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, EmptyState } from "@/components/ui";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parse, isValid } from "date-fns";
import { fr } from "date-fns/locale";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs } from "@/components/Tabs";
import { CreateSessionForm } from "@/components/CreateSessionForm";
import { TrainerFilter } from "@/components/TrainerFilter";
import { PlanningExportControls } from "@/components/PlanningExportControls";
import { PlanningCalendar } from "@/components/PlanningCalendar";
import { ArchiveSessionButton } from "@/components/ArchiveSessionButton";
import { Pagination } from "@/components/Pagination";
import { Role } from "@prisma/client";
import { borneAuxSiennesDuFormateur } from "@/lib/proprieteRoles";

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

const TABS = [
  { key: "liste", label: "Liste" },
  { key: "calendrier", label: "Calendrier" },
  { key: "archives", label: "Archives" },
];

// Les listes du planning étaient coupées en silence — 20 sessions à venir,
// 20 en continu, 50 en archives (audit S7, P2). Un organisme qui planifie
// deux mois à l'avance dépasse vingt sessions sans y penser, et rien ne le
// lui disait.
const PAGE_SIZE = 20;
const PAGE_SIZE_ARCHIVES = 30;

export default async function PlanningPage(props: {
  searchParams: Promise<{ tab?: string; month?: string; trainer?: string; page?: string; continu?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { organizationId, roles, userId } = await requireSessionContext();
  if (can(roles, "planning") === "none") redirect("/dashboard");
  const canCreate = can(roles, "planning") === "full";
  const activeTab = searchParams.tab ?? "liste";
  // Spec §2: "Trainer: their own sessions" — every other role with
  // planning access sees the whole org's schedule, optionally narrowed
  // to one trainer via the filter below (moot for TRAINER, who is
  // already locked to themselves).
  //
  // Sur les rôles effectifs (lib/proprieteRoles.ts) : la borne suit la
  // casquette formateur où qu'elle soit dans la liste, et se lève dès qu'une
  // casquette qui voit déjà tout le planning l'accompagne. Le filtre par
  // intervenant n'a de sens que pour qui n'est pas borné à lui-même — les
  // deux se déduisent donc du même booléen, et ne peuvent plus diverger.
  const borneFormateur = borneAuxSiennesDuFormateur(roles);
  const canFilterByTrainer = !borneFormateur;
  const ownerFilter =
    borneFormateur ? { trainerId: userId } : searchParams.trainer ? { trainerId: searchParams.trainer } : {};

  const [courses, trainers] = await Promise.all([
    canCreate ? prisma.course.findMany({ where: { organizationId }, orderBy: { title: "asc" } }) : Promise.resolve([]),
    canFilterByTrainer
      ? prisma.user.findMany({ where: { organizationId, role: Role.TRAINER }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Planning des sessions" subtitle="Formateurs, salles et visioconférence" />
      <Tabs basePath="/planning" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4">
        {canFilterByTrainer && trainers.length > 0 && (
          <div className="flex items-center gap-2.5">
            <TrainerFilter trainers={trainers} />
            {searchParams.trainer && <PlanningExportControls trainerId={searchParams.trainer} />}
          </div>
        )}
        {canCreate && <CreateSessionForm courses={courses} trainers={trainers} />}
        {activeTab === "calendrier" ? (
          <CalendarTab organizationId={organizationId} monthParam={searchParams.month} ownerFilter={ownerFilter} />
        ) : activeTab === "archives" ? (
          <ArchivesTab organizationId={organizationId} ownerFilter={ownerFilter} canEdit={canCreate} searchParams={searchParams} />
        ) : (
          <ListTab organizationId={organizationId} ownerFilter={ownerFilter} canCreate={canCreate} searchParams={searchParams} />
        )}
      </div>
    </>
  );
}

async function ListTab({
  organizationId,
  ownerFilter,
  canCreate,
  searchParams,
}: {
  organizationId: string;
  ownerFilter: { trainerId?: string };
  canCreate: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  // Une session en bande passante n'a pas de date de cohorte : elle n'a
  // donc rien à faire dans le calendrier, et le raisonnement d'origine
  // l'excluait de tout le Planning.
  //
  // Sauf que l'écran PROPOSE de la créer. On cliquait, ça réussissait, et
  // ça disparaissait — sans message, sans trace. Un formulaire qui crée ce
  // que sa propre page est incapable de montrer n'est pas défendable :
  // elles ont désormais leur section, sous les sessions datées.
  // Deux listes indépendantes sur le même écran, donc deux paramètres de
  // page : feuilleter les sessions datées ne doit pas déplacer les
  // formations en continu affichées en dessous.
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const pageContinu = Math.max(1, parseInt(searchParams.continu ?? "1", 10) || 1);
  // La borne porte sur la FIN de la session, pas sur son début. Avec
  // `startsAt >= maintenant`, une session du 8 au 10 août consultée le 9
  // sortait de cette liste sans entrer dans les Archives (qui prennent
  // `endsAt < maintenant`) : elle n'était donc dans aucune des deux listes
  // le jour même où on l'ouvre pour lancer l'émargement. Sur la fin, les
  // deux ensembles se complètent exactement, sans trou ni doublon — c'est
  // déjà la borne du portail formateur (mon-espace/page.tsx).
  const whereDatees = { organizationId, mode: "FIXED_DATE" as const, endsAt: { gte: new Date() }, archivedAt: null, ...ownerFilter };
  const whereContinu = { organizationId, mode: "ROLLING" as const, archivedAt: null, ...ownerFilter };

  const [sessions, total, rolling, totalContinu] = await Promise.all([
    prisma.session.findMany({
      where: whereDatees,
      include: { course: true, trainer: true, dossiers: true },
      orderBy: { startsAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.session.count({ where: whereDatees }),
    prisma.session.findMany({
      where: whereContinu,
      include: { course: true, trainer: true, dossiers: true },
      // Session n'a pas de createdAt. En bande passante, startsAt porte la
      // date de création — c'est ce que pose la route faute de cohorte.
      orderBy: { startsAt: "desc" },
      skip: (pageContinu - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.session.count({ where: whereContinu }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalPagesContinu = Math.max(1, Math.ceil(totalContinu / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-2.5">
      {total > 0 && (
        <div className="text-[12px] text-slate">
          {total} session{total > 1 ? "s" : ""} en cours ou à venir
        </div>
      )}
      {sessions.map((s) => {
        const isFull = s.dossiers.length >= s.capacity;
        const isCancelled = s.status === "CANCELLED";
        return (
          <Link
            key={s.id}
            href={`/planning/${s.id}`}
            className="bg-white border border-line rounded-card px-5 py-4 flex items-center gap-6 hover:border-ink-soft"
          >
            <div className="w-24 shrink-0">
              <div className="text-[12.5px] font-semibold text-ink">
                {format(s.startsAt, "EEE d MMM", { locale: fr })}
              </div>
              <div className="text-[11.5px] text-slate">
                {format(s.startsAt, "HH:mm")}–{format(s.endsAt, "HH:mm")}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-ink truncate">{s.course.title}</div>
              <div className="text-[11.5px] text-slate mt-0.5 truncate">
                {s.location} · {FORMAT_LABELS[s.format]}
              </div>
            </div>
            <div className="text-[12.5px] text-ink w-28 shrink-0 truncate">{s.trainer ? s.trainer.name : "À assigner"}</div>
            <div className="text-[12.5px] text-slate w-14 shrink-0 text-right">
              {s.dossiers.length}/{s.capacity}
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              {isFull && !isCancelled && <Pill tone="neutral">Complet</Pill>}
              {isCancelled ? (
                <Pill tone="danger">Annulée</Pill>
              ) : (
                <Pill tone={s.trainer ? "good" : "danger"}>{s.trainer ? "Confirmée" : "Formateur à confirmer"}</Pill>
              )}
            </div>
          </Link>
        );
      })}
      {sessions.length === 0 && (
        <EmptyState
          title="Aucune session en cours ou à venir"
          description={
            canCreate
              ? "Une session planifiée apparaît ici avec ses inscrits, son formateur et son statut — créez la première avec le formulaire ci-dessus."
              : "Aucune session planifiée ne vous est actuellement assignée."
          }
        />
      )}

      <Pagination basePath="/planning" searchParams={searchParams} page={page} totalPages={totalPages} />

      {rolling.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <div className="text-[11px] font-semibold text-slate uppercase tracking-wide">
              En continu (bande passante)
            </div>
            <div className="text-[11.5px] text-slate">
              {totalContinu} formation{totalContinu > 1 ? "s" : ""}
            </div>
          </div>
          <div className="text-[11.5px] text-slate mb-2.5">
            Sans date de cohorte : chaque apprenant démarre quand il s&apos;inscrit, avec son propre délai d&apos;accès.
          </div>
          <div className="flex flex-col gap-2.5">
            {rolling.map((s) => (
              <Link
                key={s.id}
                href={`/planning/${s.id}`}
                className="bg-white border border-line rounded-card px-5 py-4 flex items-center gap-6 hover:border-ink-soft"
              >
                <div className="w-24 shrink-0 text-[12px] text-slate">Toujours ouverte</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink truncate">{s.course.title}</div>
                  <div className="text-[11.5px] text-slate mt-0.5 truncate">
                    {s.location ? `${s.location} · ` : ""}
                    {FORMAT_LABELS[s.format]}
                  </div>
                </div>
                <div className="text-[12.5px] text-ink w-28 shrink-0 truncate">
                  {s.trainer ? s.trainer.name : "À assigner"}
                </div>
                {/* Pas de « x/capacité » ici : en bande passante il n'y a
                    pas de places à remplir, seulement des inscrits. */}
                <div className="text-[12.5px] text-slate w-14 shrink-0 text-right">
                  {s.dossiers.length} inscrit{s.dossiers.length > 1 ? "s" : ""}
                </div>
                <div className="shrink-0">
                  <Pill tone={s.trainer ? "good" : "danger"}>{s.trainer ? "Confirmée" : "Formateur à confirmer"}</Pill>
                </div>
              </Link>
            ))}
          </div>
          <Pagination
            basePath="/planning"
            searchParams={searchParams}
            page={pageContinu}
            totalPages={totalPagesContinu}
            pageKey="continu"
          />
        </div>
      )}
    </div>
  );
}

async function CalendarTab({
  organizationId,
  monthParam,
  ownerFilter,
}: {
  organizationId: string;
  monthParam?: string;
  ownerFilter: { trainerId?: string };
}) {
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const month = isValid(parsedMonth) ? parsedMonth : new Date();

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const sessions = await prisma.session.findMany({
    where: { organizationId, mode: "FIXED_DATE", startsAt: { gte: gridStart, lte: gridEnd }, ...ownerFilter },
    include: { course: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <PlanningCalendar
      month={month}
      sessions={sessions.map((s) => ({ id: s.id, startsAt: s.startsAt, courseTitle: s.course.title }))}
    />
  );
}

// Client feedback: past sessions used to just vanish from "Liste" (its query
// only ever looked at startsAt >= now) with nowhere to browse them again.
// This surfaces both flavors of "inactive" — naturally past, and manually
// archived via ArchiveSessionButton (e.g. a cancelled future session) — in
// one place, newest-first so recently-finished sessions are at the top.
async function ArchivesTab({
  organizationId,
  ownerFilter,
  canEdit,
  searchParams,
}: {
  organizationId: string;
  ownerFilter: { trainerId?: string };
  canEdit: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = {
    organizationId,
    OR: [
      // Archivée à la main, quel que soit le mode. Le `mode: "FIXED_DATE"`
      // qui coiffait tout ce `where` faisait disparaître une formation en
      // continu des TROIS onglets dès qu'on l'archivait : la Liste ne montre
      // que celles qui ne le sont pas, le Calendrier ignore ce mode, et cet
      // onglet-ci l'excluait aussi — plus aucun chemin vers « Désarchiver ».
      { archivedAt: { not: null } },
      // Terminée d'elle-même : réservé à une cohorte datée. Le `endsAt` d'une
      // session en continu est un remplissage (aujourd'hui + 10 ans, voir
      // api/planning/sessions/route.ts), pas une vraie fin — l'appliquer aux
      // deux modes rangerait ici des formations toujours ouvertes.
      { mode: "FIXED_DATE" as const, endsAt: { lt: new Date() } },
    ],
    ...ownerFilter,
  };
  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      include: { course: true, trainer: true, dossiers: true },
      orderBy: { startsAt: "desc" },
      skip: (page - 1) * PAGE_SIZE_ARCHIVES,
      take: PAGE_SIZE_ARCHIVES,
    }),
    prisma.session.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_ARCHIVES));

  return (
    <div className="flex flex-col gap-2.5">
      {total > 0 && (
        <div className="text-[12px] text-slate">
          {total} session{total > 1 ? "s" : ""} terminée{total > 1 ? "s" : ""} ou archivée{total > 1 ? "s" : ""}
        </div>
      )}
      {sessions.map((s) => {
        // Une formation en continu archivée arrive ici sans rien de ce que la
        // colonne de gauche affiche : ses dates sont un remplissage et sa
        // capacité ne borne aucune cohorte. On l'annonce pour ce qu'elle est
        // plutôt que d'imprimer une fausse date de cohorte.
        const estContinu = s.mode === "ROLLING";
        return (
          <div key={s.id} className="bg-white border border-line rounded-card px-5 py-4 flex items-center gap-6">
            <Link href={`/planning/${s.id}`} className="flex items-center gap-6 flex-1 min-w-0 hover:opacity-80">
              <div className="w-24 shrink-0">
                <div className="text-[12.5px] font-semibold text-ink">
                  {estContinu ? "En continu" : format(s.startsAt, "EEE d MMM yyyy", { locale: fr })}
                </div>
                {/* Une session reprise d'un ancien outil n'a que des dates :
                    le fichier ne porte pas d'horaires. Afficher « 01:00–01:00 »
                    la ferait passer pour une session de durée nulle, à côté
                    des 21 heures qu'elle déclare au BPF. On montre la période
                    réelle, ou rien quand elle tient sur un jour. */}
                <div className="text-[11.5px] text-slate">
                  {estContinu
                    ? "Sans cohorte"
                    : s.importedAt
                      ? format(s.startsAt, "yyyy-MM-dd") === format(s.endsAt, "yyyy-MM-dd")
                        ? "Reprise"
                        : `→ ${format(s.endsAt, "d MMM", { locale: fr })}`
                      : `${format(s.startsAt, "HH:mm")}–${format(s.endsAt, "HH:mm")}`}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold text-ink truncate">{s.course.title}</div>
                <div className="text-[11.5px] text-slate mt-0.5 truncate">
                  {s.location ? `${s.location} · ` : ""}
                  {FORMAT_LABELS[s.format]}
                </div>
              </div>
              <div className="text-[12.5px] text-ink w-28 shrink-0 truncate">{s.trainer ? s.trainer.name : "À assigner"}</div>
              <div className="text-[12.5px] text-slate w-14 shrink-0 text-right">
                {estContinu
                  ? `${s.dossiers.length} inscrit${s.dossiers.length > 1 ? "s" : ""}`
                  : `${s.dossiers.length}/${s.capacity}`}
              </div>
              <div className="shrink-0">
                <Pill tone={s.status === "CANCELLED" ? "danger" : s.archivedAt ? "neutral" : "warn"}>
                  {s.status === "CANCELLED" ? "Annulée" : s.archivedAt ? "Archivée" : "Terminée"}
                </Pill>
              </div>
            </Link>
            {canEdit && <ArchiveSessionButton sessionId={s.id} archived={Boolean(s.archivedAt)} />}
          </div>
        );
      })}
      {sessions.length === 0 && <div className="text-[12.5px] text-slate">Aucune session archivée.</div>}
      <Pagination basePath="/planning" searchParams={searchParams} page={page} totalPages={totalPages} />
    </div>
  );
}
