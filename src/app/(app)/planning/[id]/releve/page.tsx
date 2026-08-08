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

// L'ordre des statuts n'est pas alphabétique : c'est celui de l'attention.
// Ce qu'on vient chercher sur cet écran, c'est d'abord qui n'a jamais
// commencé, ensuite qui traîne, et enfin qui a fini — dans cet ordre.
const RANG: Record<ActivityStatus, number> = { not_started: 0, in_progress: 1, completed: 2 };

export default async function SessionActivityPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statut?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const auth = await requireSessionContext();
  if (can(auth.roles, "planning") === "none") redirect("/dashboard");

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
  const enCours = activity.rows.length - termines - jamais;

  // Filtrage et tri se font ici, en mémoire : le relevé d'une session tient
  // en quelques dizaines de lignes (la capacité de la session), et le
  // classement dépend d'un statut calculé, pas d'une colonne de la base.
  const statutFiltre = (["not_started", "in_progress", "completed"] as const).find((s) => s === searchParams.statut);
  const lignes = activity.rows
    .filter((r) => !statutFiltre || r.status === statutFiltre)
    .slice()
    .sort((a, b) => RANG[a.status] - RANG[b.status] || a.contactName.localeCompare(b.contactName, "fr"));

  const VUES: { cle: ActivityStatus | undefined; libelle: string; n: number }[] = [
    { cle: undefined, libelle: "Tous", n: activity.rows.length },
    { cle: "not_started", libelle: "Jamais commencé", n: jamais },
    { cle: "in_progress", libelle: "En cours", n: enCours },
    { cle: "completed", libelle: "Terminé", n: termines },
  ];

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
            {/* Des vues plutôt qu'un menu de tri : sur cet écran on ne
                cherche pas « à trier », on cherche un groupe précis — ceux
                qui n'ont jamais commencé, ceux qui ont fini. Le décompte est
                sur l'onglet, donc lisible sans cliquer. Un groupe vide reste
                affiché : « 0 jamais commencé » est une information. */}
            <div className="flex items-center gap-1 flex-wrap">
              {VUES.map((v) => {
                const actif = (searchParams.statut ?? undefined) === v.cle;
                const href = v.cle ? `/planning/${params.id}/releve?statut=${v.cle}` : `/planning/${params.id}/releve`;
                return (
                  <Link
                    key={v.libelle}
                    href={href}
                    className={`text-[12px] px-2.5 py-1 rounded-full ${actif ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
                  >
                    {v.libelle} <span className="tabular-nums">({v.n})</span>
                  </Link>
                );
              })}
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
                  {lignes.map((r) => (
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
              {lignes.length === 0 && (
                <div className="px-4 py-4 text-[12.5px] text-slate">Aucun apprenant dans cet état.</div>
              )}
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
