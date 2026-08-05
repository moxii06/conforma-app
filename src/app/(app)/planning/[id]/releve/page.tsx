import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Button, EmptyState } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";
import Link from "next/link";
import { loadSessionActivity, activityPeriodLabel } from "@/lib/sessionActivity";
import { ACTIVITY_REPORT_NOTICE, ACTIVITY_STATUS_LABELS, type ActivityStatus } from "@/lib/activityReport";

// Le pendant de l'écran d'émargement pour une formation suivie à distance
// et en asynchrone : il n'y a personne à faire signer, mais il y a une
// réalisation à justifier. Voir lib/activityReport.ts pour ce que ce
// relevé prouve — et ce qu'il ne prouve pas.

const TONS: Record<ActivityStatus, "good" | "warn" | "neutral"> = {
  completed: "good",
  in_progress: "warn",
  not_started: "neutral",
};

const jour = (d: Date | null) =>
  d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default async function SessionActivityPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireSessionContext();
  if (can(auth.role, "planning") === "none") redirect("/dashboard");

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    select: { id: true, trainerId: true },
  });
  if (!session) notFound();
  if (auth.role === Role.TRAINER && session.trainerId !== auth.userId) redirect("/planning");

  const activity = await loadSessionActivity(auth.organizationId, params.id);
  if (!activity) notFound();

  const termines = activity.rows.filter((r) => r.status === "completed").length;
  const jamais = activity.rows.filter((r) => r.status === "not_started").length;

  return (
    <>
      <PageHeader
        title="Relevé d'activité"
        subtitle={`${activity.courseTitle} — ${activityPeriodLabel(activity)}`}
        action={
          <div className="flex items-center gap-2.5">
            <Button href={`/planning/${params.id}`} variant="secondary">
              ← Retour à la session
            </Button>
            <Button href={`/api/planning/sessions/${params.id}/activity-export`}>Exporter en PDF</Button>
          </div>
        }
      />
      <div className="p-8 flex flex-col gap-4 max-w-4xl">
        {activity.rows.length === 0 ? (
          <EmptyState
            title="Aucun apprenant inscrit"
            description="Le relevé se remplit à mesure que les apprenants avancent dans leurs modules — inscrivez-en un depuis la fiche de la session."
            action={
              <Button href={`/planning/${params.id}`} size="sm">
                Aller à la session
              </Button>
            }
          />
        ) : (
          <>
            <div className="text-[12px] text-slate">
              {activity.rows.length} apprenant{activity.rows.length > 1 ? "s" : ""} · {termines} terminé
              {termines > 1 ? "s" : ""}
              {jamais > 0 && ` · ${jamais} jamais commencé${jamais > 1 ? "s" : ""}`}
            </div>

            <div className="bg-white border border-line rounded-card overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    {["Apprenant", "Modules", "Premier accès", "Dernière activité", "Évaluations", "Statut"].map((h, i) => (
                      <th
                        key={h}
                        className={`font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5 ${i === 0 ? "text-left" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.rows.map((r) => (
                    <tr key={r.contactName} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{r.contactName}</div>
                        {r.certificateIssuedAt && (
                          <div className="text-[11px] text-slate mt-0.5">
                            Attestation délivrée le {jour(r.certificateIssuedAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-pebble rounded-full overflow-hidden shrink-0">
                            <div className="h-full bg-sage rounded-full" style={{ width: `${r.percent}%` }} />
                          </div>
                          <span className="text-slate tabular-nums font-mono text-[11.5px]">
                            {r.modulesCompleted}/{r.modulesTotal}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate whitespace-nowrap">{jour(r.firstActivityAt)}</td>
                      <td className="px-4 py-3 text-slate whitespace-nowrap">{jour(r.lastActivityAt)}</td>
                      <td className="px-4 py-3 text-slate whitespace-nowrap">
                        {/* Un tiret, pas « 0/0 » : sans évaluation au
                            programme, il n'y a rien à réussir ni à rater. */}
                        {r.quizTaken > 0
                          ? `${r.quizPassed}/${r.quizTaken} réussie${r.quizTaken > 1 ? "s" : ""}${r.bestScorePercent !== null ? ` · ${r.bestScorePercent} %` : ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={TONS[r.status]}>{ACTIVITY_STATUS_LABELS[r.status]}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="text-[11.5px] text-slate leading-relaxed border-t border-line pt-3">
          {ACTIVITY_REPORT_NOTICE}{" "}
          <Link href="/faq" className="text-ink underline decoration-line hover:decoration-ink">
            En savoir plus
          </Link>
        </div>
      </div>
    </>
  );
}
