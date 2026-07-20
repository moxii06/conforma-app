import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { NewModuleForm } from "@/components/NewModuleForm";

export default async function FormationsPage() {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "planning") === "none") redirect("/dashboard");
  const canManage = can(role, "planning") === "full";

  const courses = await prisma.course.findMany({
    where: { organizationId },
    include: {
      elearningModules: {
        include: { progress: true },
      },
      _count: { select: { sessions: true } },
    },
    orderBy: { title: "asc" },
  });

  return (
    <>
      <PageHeader title="Catalogue de formations" subtitle="Cours et modules e-learning associés" />
      <div className="p-8 flex flex-col gap-4 max-w-3xl">
        {courses.map((course) => (
          <div key={course.id} className="bg-white border border-line rounded-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13.5px] font-semibold text-ink">{course.title}</div>
              <div className="text-[11.5px] text-slate">{course._count.sessions} session(s)</div>
            </div>
            <div className="flex flex-col gap-2">
              {course.elearningModules.map((m) => {
                const learners = m.progress.length;
                const avg = learners > 0 ? Math.round(m.progress.reduce((s, p) => s + p.percentComplete, 0) / learners) : 0;
                return (
                  <div key={m.id} className="border-t border-line py-2 flex items-center justify-between gap-3">
                    <div className="text-[12.5px] text-ink">{m.title}</div>
                    <div className="text-[11.5px] text-slate w-40 shrink-0">
                      {learners > 0 ? `${avg}% en moyenne (${learners} apprenant${learners > 1 ? "s" : ""})` : "Aucune progression"}
                    </div>
                  </div>
                );
              })}
              {course.elearningModules.length === 0 && <div className="text-[12px] text-slate py-1">Aucun module.</div>}
            </div>
            {canManage && (
              <div className="mt-2.5 pt-2.5 border-t border-line">
                <NewModuleForm courseId={course.id} />
              </div>
            )}
          </div>
        ))}
        {courses.length === 0 && <div className="text-[12.5px] text-slate">Aucun cours — créez-en un depuis le planning des sessions.</div>}
      </div>
    </>
  );
}
