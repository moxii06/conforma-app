import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, canAccessSecureReports } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ComplaintForm } from "@/components/ComplaintForm";
import { ComplaintStatusForm } from "@/components/ComplaintStatusForm";
import { SecureReportForm } from "@/components/SecureReportForm";
import { SecureReportStatusForm } from "@/components/SecureReportStatusForm";

const COMPLAINT_STATUS_LABELS: Record<string, string> = { open: "Ouverte", investigating: "En cours d'examen", resolved: "Résolue" };
const COMPLAINT_STATUS_TONE: Record<string, "danger" | "warn" | "good"> = { open: "danger", investigating: "warn", resolved: "good" };
const REPORT_STATUS_LABELS: Record<string, string> = { received: "Reçu", under_review: "En cours d'examen", escalated: "Escaladé", closed: "Clos" };
const REPORT_STATUS_TONE: Record<string, "danger" | "warn" | "good" | "neutral"> = { received: "danger", under_review: "warn", escalated: "danger", closed: "neutral" };

// Access to an already-received report is logged every time an admin's
// page load renders it — deduped to once per 5 minutes per (report, admin)
// so a page refresh doesn't spam the trail, but a genuinely new session
// looking at it always does. The log itself is shown right below each
// report, to every admin, not just the one who triggered it.
async function logSecureReportAccess(reportIds: string[], userId: string, userName: string) {
  if (reportIds.length === 0) return;
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const recent = await prisma.secureReportAccessLog.findMany({
    where: { reportId: { in: reportIds }, viewedByUserId: userId, viewedAt: { gte: cutoff } },
    select: { reportId: true },
  });
  const recentIds = new Set(recent.map((r) => r.reportId));
  const toLog = reportIds.filter((id) => !recentIds.has(id));
  if (toLog.length === 0) return;
  await prisma.secureReportAccessLog.createMany({
    data: toLog.map((reportId) => ({ reportId, viewedByUserId: userId, viewedByName: userName })),
  });
}

export default async function SupportPage() {
  const session = await requireSessionContext();
  if (can(session.role, "support") === "none") redirect("/dashboard");

  const canManageComplaints = can(session.role, "dossiers") !== "none";
  const canViewSecureReports = canAccessSecureReports(session.role);

  const [myDossiers, complaints] = await Promise.all([
    session.role === "LEARNER"
      ? prisma.dossier.findMany({
          where: { organizationId: session.organizationId, learnerUserId: session.userId },
          include: { session: { include: { course: true } } },
        })
      : Promise.resolve([]),
    canManageComplaints
      ? prisma.complaint.findMany({ where: { organizationId: session.organizationId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  let secureReports: Awaited<ReturnType<typeof prisma.secureReport.findMany>> = [];
  let accessLogByReport = new Map<string, { viewedByName: string; viewedAt: Date }[]>();
  if (canViewSecureReports) {
    secureReports = await prisma.secureReport.findMany({ where: { organizationId: session.organizationId }, orderBy: { createdAt: "desc" } });
    await logSecureReportAccess(secureReports.map((r) => r.id), session.userId, session.name || session.email);
    const logs = await prisma.secureReportAccessLog.findMany({
      where: { reportId: { in: secureReports.map((r) => r.id) } },
      orderBy: { viewedAt: "desc" },
    });
    accessLogByReport = new Map();
    for (const log of logs) {
      const list = accessLogByReport.get(log.reportId) ?? [];
      list.push({ viewedByName: log.viewedByName, viewedAt: log.viewedAt });
      accessLogByReport.set(log.reportId, list);
    }
  }

  return (
    <>
      <PageHeader title="Réclamations & signalement" subtitle="Support des apprenants et canal de signalement confidentiel" />
      <div className="p-8 flex flex-col gap-6 max-w-2xl">
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Déposer une réclamation</div>
          <ComplaintForm
            dossiers={myDossiers.map((d) => ({ id: d.id, label: d.session.course.title }))}
          />
        </div>

        {canManageComplaints && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3.5">Réclamations reçues ({complaints.length})</div>
            {complaints.map((c) => (
              <div key={c.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] text-ink font-medium">{c.subject}</div>
                  <Pill tone={COMPLAINT_STATUS_TONE[c.status] ?? "warn"}>{COMPLAINT_STATUS_LABELS[c.status] ?? c.status}</Pill>
                </div>
                <div className="text-[11.5px] text-slate">{format(c.createdAt, "d MMM yyyy", { locale: fr })} · {c.submittedByName}</div>
                <div className="text-[12.5px] text-ink">{c.description}</div>
                {c.resolutionNotes && <div className="text-[12.5px] text-ink"><span className="text-slate">Résolution : </span>{c.resolutionNotes}</div>}
                <ComplaintStatusForm complaintId={c.id} status={c.status} resolutionNotes={c.resolutionNotes} />
              </div>
            ))}
            {complaints.length === 0 && <div className="text-[12.5px] text-slate">Aucune réclamation.</div>}
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-1">Signalement confidentiel</div>
          <div className="text-[11.5px] text-slate mb-3.5">
            Harcèlement, discrimination ou tout fait grave. Seuls les administrateurs habilités ont accès aux
            signalements, et chaque consultation est tracée.
          </div>
          <SecureReportForm />
        </div>

        {canViewSecureReports && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3.5">Signalements reçus ({secureReports.length})</div>
            {secureReports.map((r) => (
              <div key={r.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] text-slate">
                    {format(r.createdAt, "d MMM yyyy HH:mm", { locale: fr })} ·{" "}
                    {r.reporterName ? r.reporterName : "Anonyme"}
                    {r.reporterContact && ` · ${r.reporterContact}`}
                  </div>
                  <Pill tone={REPORT_STATUS_TONE[r.status] ?? "warn"}>{REPORT_STATUS_LABELS[r.status] ?? r.status}</Pill>
                </div>
                <div className="text-[12.5px] text-ink">{r.description}</div>
                {r.escalationNotes && <div className="text-[12.5px] text-ink"><span className="text-slate">Suivi : </span>{r.escalationNotes}</div>}
                <SecureReportStatusForm reportId={r.id} status={r.status} escalationNotes={r.escalationNotes} />
                <div className="text-[11px] text-slate">
                  Consulté par : {(accessLogByReport.get(r.id) ?? []).map((l) => `${l.viewedByName} (${format(l.viewedAt, "d MMM HH:mm", { locale: fr })})`).join(", ") || "—"}
                </div>
              </div>
            ))}
            {secureReports.length === 0 && <div className="text-[12.5px] text-slate">Aucun signalement.</div>}
          </div>
        )}
      </div>
    </>
  );
}
