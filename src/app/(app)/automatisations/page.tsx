import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { AutomationRulesPanel } from "@/components/AutomationRulesPanel";

// Client feedback (audit UX) : le moteur d'automatisation tournait déjà
// (règles par formation configurables depuis /formations/[id], cron
// quotidien) sans jamais être visible ailleurs que formation par
// formation — un OF qui ne voit pas ce qui se déclenche en son nom ne
// peut pas lui faire confiance. Cette page ne réinvente rien : elle
// réutilise AutomationRulesPanel tel quel (mêmes routes, même logique
// d'activation) et surface les ClientOutreach déjà créés par le cron
// (sentByUserId "system") comme journal d'activité, plutôt que de créer
// un nouveau modèle de traçabilité.
const AUTO_OUTREACH_LABELS: Record<string, string> = {
  needs_assessment_reminder: "Rappel recueil des besoins",
  contract_reminder: "Rappel convention",
  rolling_duration_reminder: "Rappel durée d'accès",
  satisfaction_reminder: "Rappel satisfaction",
  message: "Enquête de satisfaction envoyée",
  session_reminder: "Rappel de session",
  certificate_expiring: "Rappel de renouvellement (attestation)",
  instalment_issued: "Échéance de paiement émise",
  invoice_overdue_reminder: "Relance d'échéance en retard",
};

export default async function AutomationsPage() {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "automations") === "none") redirect("/dashboard");

  const [courses, recentActivity] = await Promise.all([
    prisma.course.findMany({
      where: { organizationId, archivedAt: null },
      include: { automationRules: { orderBy: { createdAt: "asc" } } },
      orderBy: { title: "asc" },
    }),
    prisma.clientOutreach.findMany({
      where: { organizationId, sentByUserId: "system" },
      include: { contact: true, dossier: { include: { session: { include: { course: true } } } } },
      orderBy: { sentAt: "desc" },
      take: 50,
    }),
  ]);

  const withRules = courses.filter((c) => c.automationRules.length > 0);
  const withoutRules = courses.filter((c) => c.automationRules.length === 0);
  const totalActive = courses.reduce((n, c) => n + c.automationRules.filter((r) => r.active).length, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sentLast30Days = recentActivity.filter((a) => a.sentAt >= thirtyDaysAgo).length;

  return (
    <>
      <PageHeader title="Automatisations" subtitle="Ce qui se déclenche automatiquement pour vos apprenants, sans action manuelle" />
      <div className="p-8 max-w-4xl flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-line rounded-card p-4">
            <div className="text-[22px] font-semibold text-ink">{totalActive}</div>
            <div className="text-[11.5px] text-slate">règle{totalActive !== 1 && "s"} active{totalActive !== 1 && "s"}, sur {courses.length} formation{courses.length !== 1 && "s"}</div>
          </div>
          <div className="bg-white border border-line rounded-card p-4">
            <div className="text-[22px] font-semibold text-ink">{sentLast30Days}</div>
            <div className="text-[11.5px] text-slate">envoi{sentLast30Days !== 1 && "s"} automatique{sentLast30Days !== 1 && "s"} ces 30 derniers jours</div>
          </div>
        </div>

        <div>
          <div className="text-[13.5px] font-semibold text-ink mb-3">Règles par formation</div>
          {courses.length === 0 && <div className="text-[12.5px] text-slate">Aucune formation créée pour le moment.</div>}
          <div className="flex flex-col gap-3">
            {withRules.map((course) => (
              <div key={course.id} className="bg-white border border-line rounded-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <Link href={`/formations/${course.id}`} className="text-[13px] font-semibold text-ink hover:underline">
                    {course.title}
                  </Link>
                  <Pill tone={course.automationRules.some((r) => r.active) ? "good" : "neutral"}>
                    {course.automationRules.filter((r) => r.active).length}/{course.automationRules.length} active{course.automationRules.filter((r) => r.active).length !== 1 && "s"}
                  </Pill>
                </div>
                <AutomationRulesPanel courseId={course.id} rules={course.automationRules} />
              </div>
            ))}
          </div>

          {withoutRules.length > 0 && (
            <div className="bg-white border border-line rounded-card p-4 mt-3">
              <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">
                Sans automatisation configurée ({withoutRules.length})
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {withoutRules.map((c) => (
                  <Link key={c.id} href={`/formations/${c.id}`} className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink">
                    {c.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[13.5px] font-semibold text-ink mb-3">Activité récente</div>
          <div className="bg-white border border-line rounded-card">
            {recentActivity.length === 0 && (
              <div className="px-4 py-6 text-[12.5px] text-slate text-center">
                Aucun envoi automatique pour le moment — dès qu'une règle se déclenche, l'historique apparaît ici.
              </div>
            )}
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line first:border-t-0 text-[12.5px]">
                <div className="min-w-0">
                  <span className="text-ink font-medium">{a.contact.firstName} {a.contact.lastName}</span>
                  <span className="text-slate"> — {AUTO_OUTREACH_LABELS[a.type] ?? a.type}</span>
                  {a.dossier?.session.course && <span className="text-slate"> · {a.dossier.session.course.title}</span>}
                </div>
                <div className="text-slate shrink-0">{format(a.sentAt, "d MMM yyyy", { locale: fr })}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
