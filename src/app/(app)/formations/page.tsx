import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { NewModuleForm } from "@/components/NewModuleForm";
import { AssignLearnersPanel } from "@/components/AssignLearnersPanel";
import { RevokeAccessButton } from "@/components/RevokeAccessButton";
import { DeleteModuleButton } from "@/components/DeleteModuleButton";
import { QuizBuilder } from "@/components/QuizBuilder";
import { ModuleReorderList } from "@/components/ModuleReorderList";
import { ReplaceModuleFileForm } from "@/components/ReplaceModuleFileForm";
import { CreateCourseForm } from "@/components/CreateCourseForm";
import { EnrollLearnerPanel } from "@/components/EnrollLearnerPanel";
import { EditCourseForm } from "@/components/EditCourseForm";
import { ArchiveCourseButton } from "@/components/ArchiveCourseButton";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const TYPE_LABELS: Record<string, string> = { video: "Vidéo", document: "Document", quiz: "Quiz" };

const TABS = [
  { key: "catalogue", label: "Catalogue" },
  { key: "archivees", label: "Archivées" },
];

const courseInclude = {
  elearningModules: {
    include: {
      progress: { include: { dossier: { include: { contact: true } } } },
      quiz: { include: { questions: { orderBy: { order: "asc" as const } } } },
      versions: { orderBy: { replacedAt: "desc" as const } },
    },
    orderBy: { order: "asc" as const },
  },
  sessions: { include: { dossiers: { include: { contact: true } } } },
  responsibleUsers: true,
  _count: { select: { sessions: true } },
};

type CourseWithRelations = Awaited<ReturnType<typeof prisma.course.findMany<{ where: { organizationId: string }; include: typeof courseInclude }>>>[number];

export default async function FormationsPage({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "planning") === "none") redirect("/dashboard");
  const canManage = can(role, "planning") === "full";
  const activeTab = searchParams.tab === "archivees" ? "archivees" : "catalogue";
  const q = searchParams.q?.trim();

  const [courses, members] = await Promise.all([
    prisma.course.findMany({
      where: {
        organizationId,
        archivedAt: activeTab === "archivees" ? { not: null } : null,
        ...(activeTab === "archivees" && q
          ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      include: courseInclude,
      orderBy: activeTab === "archivees" ? { archivedAt: "desc" } : { title: "asc" },
    }),
    canManage
      ? prisma.user.findMany({
          where: { organizationId, status: "active", role: { not: "LEARNER" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Catalogue de formations" subtitle="Cours et modules e-learning associés" />
      <Tabs basePath="/formations" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-3xl">
        {activeTab === "catalogue" ? (
          <>
            {canManage && <CreateCourseForm members={members} />}
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} canManage={canManage} members={members} />
            ))}
            {courses.length === 0 && <div className="text-[12.5px] text-slate">Aucun cours — créez-en un depuis le planning des sessions.</div>}
          </>
        ) : (
          <>
            <SearchInput placeholder="Rechercher une formation archivée…" />
            {courses.map((course) => (
              <ArchivedCourseCard key={course.id} course={course} canManage={canManage} />
            ))}
            {courses.length === 0 && <div className="text-[12.5px] text-slate">Aucune formation archivée{q ? " pour cette recherche" : ""}.</div>}
          </>
        )}
      </div>
    </>
  );
}

function ArchivedCourseCard({ course, canManage }: { course: CourseWithRelations; canManage: boolean }) {
  const learnerCount = course.sessions.reduce((sum, s) => sum + s.dossiers.length, 0);
  return (
    <div className="bg-white border border-line rounded-card p-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">{course.title}</div>
        {course.description && <div className="text-[11.5px] text-slate mt-0.5">{course.description}</div>}
        <div className="text-[11px] text-slate mt-0.5">
          {learnerCount} apprenant{learnerCount > 1 ? "s" : ""} · {course._count.sessions} session(s)
          {course.archivedAt && ` · archivée le ${format(course.archivedAt, "d MMM yyyy", { locale: fr })}`}
        </div>
      </div>
      {canManage && <ArchiveCourseButton courseId={course.id} archived />}
    </div>
  );
}

function CourseCard({
  course,
  canManage,
  members,
}: {
  course: CourseWithRelations;
  canManage: boolean;
  members: { id: string; name: string }[];
}) {
  const courseDossiers = course.sessions.flatMap((s) =>
    s.dossiers.map((d) => ({ id: d.id, contactName: `${d.contact.firstName} ${d.contact.lastName}` }))
  );
  const VISIBLE_LEARNERS = 12;
  const rollingSessionCount = course.sessions.filter((s) => s.mode === "ROLLING").length;

  return (
            <div className="bg-white border border-line rounded-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{course.title}</div>
                  {course.description && <div className="text-[11.5px] text-slate mt-0.5">{course.description}</div>}
                  {course.responsibleUsers.length > 0 && (
                    <div className="text-[11px] text-slate mt-0.5">
                      Responsable{course.responsibleUsers.length > 1 ? "s" : ""} : {course.responsibleUsers.map((u) => u.name).join(", ")}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rollingSessionCount > 0 && <Pill tone="neutral">{rollingSessionCount} en continu</Pill>}
                  <div className="text-[11.5px] text-slate">{course._count.sessions} session(s)</div>
                </div>
              </div>

              {canManage && (
                <div className="flex items-center gap-3 mb-3">
                  <EditCourseForm
                    courseId={course.id}
                    members={members}
                    initial={{ title: course.title, description: course.description, responsibleUserIds: course.responsibleUsers.map((u) => u.id) }}
                  />
                  <ArchiveCourseButton courseId={course.id} archived={false} />
                </div>
              )}

              <div className="border-t border-line pt-3 mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
                    Apprenants inscrits ({courseDossiers.length})
                  </div>
                  {canManage && <EnrollLearnerPanel courseId={course.id} />}
                </div>
                {courseDossiers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {courseDossiers.slice(0, VISIBLE_LEARNERS).map((d) => (
                      <Link
                        key={d.id}
                        href={`/dossiers/${d.id}`}
                        className="inline-block bg-[#FAF8F2] border border-line rounded-full px-2.5 py-1 text-[11.5px] text-ink hover:border-ink-soft"
                      >
                        {d.contactName}
                      </Link>
                    ))}
                    {courseDossiers.length > VISIBLE_LEARNERS && (
                      <span className="inline-flex items-center px-1.5 text-[11.5px] text-slate">
                        +{courseDossiers.length - VISIBLE_LEARNERS} autre(s)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-slate">Aucun apprenant inscrit pour l&apos;instant.</div>
                )}
              </div>

              {course.elearningModules.length > 0 && (
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">Modules e-learning</div>
              )}
              <div className="flex flex-col gap-3">
                {(() => {
                  const rows = course.elearningModules.map((m) => {
                  const assignedIds = new Set(m.progress.map((p) => p.dossierId));
                  const eligible = courseDossiers.filter((d) => !assignedIds.has(d.id));
                  return {
                    id: m.id,
                    node: (
                    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Pill tone="neutral">{TYPE_LABELS[m.type] ?? m.type}</Pill>
                            <span className="text-[12.5px] text-ink font-medium">{m.title}</span>
                          </div>
                          {m.description && <div className="text-[11.5px] text-slate mt-0.5">{m.description}</div>}
                        </div>
                        {m.type === "quiz" ? (
                          <span className="text-[11px] text-slate shrink-0">
                            {m.quiz?.questions.length ?? 0} question(s)
                          </span>
                        ) : m.fileUrl ? (
                          <a
                            href={m.type === "video" ? `/api/lms/modules/${m.id}/stream` : m.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink shrink-0"
                          >
                            Voir le fichier
                          </a>
                        ) : (
                          <span className="text-[11px] text-rust shrink-0">Aucun fichier déposé</span>
                        )}
                      </div>

                      {m.type !== "quiz" && canManage && (
                        <div className="flex items-center gap-2.5">
                          <ReplaceModuleFileForm moduleId={m.id} type={m.type} />
                        </div>
                      )}
                      {m.versions.length > 0 && (
                        <details className="text-[11px] text-slate">
                          <summary className="cursor-pointer">Historique des fichiers ({m.versions.length})</summary>
                          <div className="flex flex-col gap-0.5 mt-1 pl-2">
                            {m.versions.map((v) => (
                              <div key={v.id}>
                                {v.fileUrl ? (
                                  <a href={v.fileUrl} target="_blank" rel="noreferrer" className="underline decoration-line hover:decoration-ink">
                                    {v.fileName ?? "Fichier"}
                                  </a>
                                ) : (
                                  "Fichier"
                                )}{" "}
                                — remplacé le {new Date(v.replacedAt).toLocaleDateString("fr-FR")} par {v.replacedByName}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {m.type === "quiz" && canManage && (
                        <QuizBuilder
                          moduleId={m.id}
                          quizId={m.quiz?.id ?? null}
                          minScorePercent={m.quiz?.minScorePercent ?? 70}
                          maxAttempts={m.quiz?.maxAttempts ?? null}
                          questions={m.quiz?.questions ?? []}
                        />
                      )}

                      {m.progress.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {m.progress.map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-3 text-[12px]">
                              <span className="text-ink">{p.dossier.contact.firstName} {p.dossier.contact.lastName}</span>
                              <div className="flex items-center gap-2.5">
                                <span className="text-slate w-10 text-right">{p.percentComplete}%</span>
                                {canManage && <RevokeAccessButton progressId={p.id} />}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {m.progress.length === 0 && <div className="text-[11.5px] text-slate">Aucun apprenant assigné.</div>}

                      {canManage && (
                        <div className="flex items-center gap-3.5 flex-wrap">
                          <AssignLearnersPanel moduleId={m.id} eligibleDossiers={eligible} />
                          <DeleteModuleButton moduleId={m.id} />
                        </div>
                      )}
                    </div>
                    ),
                  };
                  });
                  return canManage && rows.length > 1 ? (
                    <ModuleReorderList courseId={course.id} items={rows} />
                  ) : (
                    rows.map((r) => <div key={r.id}>{r.node}</div>)
                  );
                })()}
                {course.elearningModules.length === 0 && <div className="text-[12px] text-slate py-1">Aucun module.</div>}
              </div>
              {canManage && (
                <div className="mt-3 pt-3 border-t border-line">
                  <NewModuleForm courseId={course.id} />
                </div>
              )}
            </div>
  );
}
