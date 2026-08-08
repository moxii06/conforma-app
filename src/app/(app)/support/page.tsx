import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, canAccessSecureReports } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ComplaintStatusForm } from "@/components/ComplaintStatusForm";
import { SecureReportStatusForm } from "@/components/SecureReportStatusForm";
import { SupportRequestDialog } from "@/components/SupportRequestDialog";
import { AssignSupportItemForm } from "@/components/AssignSupportItemForm";
import { ArchiveSupportItemButton } from "@/components/ArchiveSupportItemButton";
import { ReplyToComplaintDialog } from "@/components/ReplyToComplaintDialog";
import { SupportTrackingTable, type LigneSuivi } from "@/components/SupportTrackingTable";
import { SearchInput } from "@/components/SearchInput";
import { Pagination } from "@/components/Pagination";
import { Tabs } from "@/components/Tabs";
import { listerMembresSupport, type MembreSupport } from "@/lib/supportAssignment";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_TONE,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONE,
  URGENCY_LABELS,
  URGENCY_TONE,
  estTraite,
  normaliserUrgence,
  tonStatut,
  libelleStatut,
} from "@/lib/supportRequests";
import { Role, type Prisma } from "@prisma/client";

const RIGHTS_STATUS_LABELS: Record<string, string> = { open: "Ouverte", in_progress: "En cours", closed: "Traitée" };
const RIGHTS_STATUS_TONE: Record<string, "danger" | "warn" | "good"> = { open: "danger", in_progress: "warn", closed: "good" };
const RIGHTS_TYPE_LABELS: Record<string, string> = {
  access: "Accès à mes données",
  erasure: "Effacement de mes données",
  portability: "Portabilité de mes données",
  rectification: "Rectification de mes données",
};

// Les libellés de statut et d'urgence vivent dans lib/supportRequests.ts :
// le formulaire d'assignation et le tableau de suivi les lisent aussi, et
// trois copies du mot « Résolue » finissent toujours par diverger.

// La liste détaillée reste bornée : chaque ligne porte un formulaire de
// statut, un formulaire d'assignation et un bloc de preuve. Le décompte
// affiché vient de count(), jamais de la longueur du lot — une liste tronquée
// dont le compteur se lit comme un total est un mensonge (règle du projet).
const MAX_LIGNES_DETAILLEES = 50;
const PAGE_SIZE_SUIVI = 20;

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

export default async function SupportPage(props: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await requireSessionContext();
  // `session.roles` et non `session.role` : un formateur qui est aussi
  // responsable administratif doit être traité ici comme les deux.
  if (can(session.roles, "support") === "none") redirect("/dashboard");

  const canManageComplaints = can(session.roles, "dossiers") !== "none";
  const canViewSecureReports = canAccessSecureReports(session.roles);
  const peutSuivre = canManageComplaints || canViewSecureReports;

  // Retour client explicite : l'Admin OF et le responsable administratif
  // REÇOIVENT les demandes, ils n'en déposent pas. Leur proposer « Nouvelle
  // demande » revient à leur proposer de s'écrire à eux-mêmes. Le test porte
  // sur les rôles EFFECTIFS (cumul compris), pas sur le seul rôle principal.
  const recoitLesDemandes = session.roles.some((r) => r === Role.ADMIN_OF || r === Role.ADMIN_MANAGER);

  const TABS = [
    { key: "demandes", label: "Demandes" },
    ...(peutSuivre ? [{ key: "suivi", label: "Tableau de suivi" }] : []),
    ...(peutSuivre ? [{ key: "archivees", label: "Archivées" }] : []),
  ];
  const demande = searchParams.tab;
  const activeTab = TABS.some((t) => t.key === demande) ? (demande as string) : TABS[0].key;
  const showArchived = activeTab === "archivees";
  const showSuivi = activeTab === "suivi";

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  /* -------------------------------------------------------------- *
   * Onglet « Tableau de suivi »
   * -------------------------------------------------------------- */

  let lignesSuivi: LigneSuivi[] = [];
  let totalSuivi = 0;
  if (showSuivi) {
    const filtreReclamations: Prisma.ComplaintWhereInput = {
      organizationId: session.organizationId,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { submittedByName: { contains: q, mode: "insensitive" } },
              { assignedToName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    // La recherche sur un signalement ne porte QUE sur son responsable : ni
    // son contenu ni l'identité de son auteur n'apparaissent dans ce tableau,
    // et une recherche qui trouverait sur un texte invisible serait autant une
    // fuite qu'une énigme.
    const filtreSignalements: Prisma.SecureReportWhereInput = {
      organizationId: session.organizationId,
      archivedAt: null,
      ...(q ? { assignedToName: { contains: q, mode: "insensitive" } } : {}),
    };

    // Deux tables, une seule liste triée par date de réception. Pour servir la
    // page N il suffit de tirer N × taille lignes de CHAQUE source : aucune
    // ligne au-delà ne peut remonter dans les N × taille premières du mélange.
    // Exact, et borné — contrairement à « tout charger puis découper ».
    const besoin = page * PAGE_SIZE_SUIVI;
    const [reclamations, nbReclamations, signalements, nbSignalements] = await Promise.all([
      canManageComplaints
        ? prisma.complaint.findMany({ where: filtreReclamations, orderBy: { createdAt: "desc" }, take: besoin })
        : Promise.resolve([]),
      canManageComplaints ? prisma.complaint.count({ where: filtreReclamations }) : Promise.resolve(0),
      canViewSecureReports
        ? prisma.secureReport.findMany({ where: filtreSignalements, orderBy: { createdAt: "desc" }, take: besoin })
        : Promise.resolve([]),
      canViewSecureReports ? prisma.secureReport.count({ where: filtreSignalements }) : Promise.resolve(0),
    ]);

    totalSuivi = nbReclamations + nbSignalements;
    const melange: LigneSuivi[] = [
      ...reclamations.map((c) => ({
        id: c.id,
        kind: "complaints" as const,
        sujet: c.subject,
        demandeur: c.submittedByName,
        responsable: c.assignedToName,
        destinatairesEnPlus: c.notifyUserIds.length,
        echeance: c.assigneeDeadline,
        urgence: normaliserUrgence(c.urgency),
        statutLabel: libelleStatut("complaints", c.status),
        statutTone: tonStatut("complaints", c.status),
        traite: estTraite("complaints", c.status),
        aPreuve: Boolean(c.proofFileUrl),
        creeLe: c.createdAt,
      })),
      ...signalements.map((r) => ({
        id: r.id,
        kind: "secure-reports" as const,
        // Volontairement sans contenu : ce tableau sert à piloter le
        // traitement, pas à relire les faits. Le signalement lui-même se lit
        // dans l'onglet « Demandes », où chaque consultation est tracée.
        sujet: "Signalement confidentiel",
        demandeur: "Identité protégée",
        responsable: r.assignedToName,
        destinatairesEnPlus: r.notifyUserIds.length,
        echeance: r.assigneeDeadline,
        urgence: normaliserUrgence(r.urgency),
        statutLabel: libelleStatut("secure-reports", r.status),
        statutTone: tonStatut("secure-reports", r.status),
        traite: estTraite("secure-reports", r.status),
        aPreuve: Boolean(r.proofFileUrl),
        creeLe: r.createdAt,
      })),
    ].sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime());

    lignesSuivi = melange.slice((page - 1) * PAGE_SIZE_SUIVI, page * PAGE_SIZE_SUIVI);
  }
  const totalPagesSuivi = Math.max(1, Math.ceil(totalSuivi / PAGE_SIZE_SUIVI));

  /* -------------------------------------------------------------- *
   * Onglets « Demandes » / « Archivées »
   * -------------------------------------------------------------- */

  const listerDetail = !showSuivi;

  const [myDossiers, complaints, nbComplaints, members, resolvedComplaints] = await Promise.all([
    session.role === "LEARNER"
      ? prisma.dossier.findMany({
          where: { organizationId: session.organizationId, learnerUserId: session.userId },
          include: { session: { include: { course: true } } },
        })
      : Promise.resolve([]),
    canManageComplaints && listerDetail
      ? prisma.complaint.findMany({
          where: { organizationId: session.organizationId, archivedAt: showArchived ? { not: null } : null },
          orderBy: { createdAt: "desc" },
          take: MAX_LIGNES_DETAILLEES,
        })
      : Promise.resolve([]),
    canManageComplaints && listerDetail
      ? prisma.complaint.count({
          where: { organizationId: session.organizationId, archivedAt: showArchived ? { not: null } : null },
        })
      : Promise.resolve(0),
    // Les membres assignables — rôles effectifs relus depuis la base, ce qui
    // permet aussi de savoir qui est habilité aux signalements confidentiels.
    (canManageComplaints || canViewSecureReports) && listerDetail
      ? listerMembresSupport(session.organizationId)
      : Promise.resolve<MembreSupport[]>([]),
    // Indicateur Qualiopi 31 (constat réel de l'audit certificateur) : le
    // délai de traitement des réclamations doit être affiché, pas seulement
    // suivi en interne — calculé sur TOUTES les réclamations résolues, pas
    // seulement celles de l'onglet actif, pour rester une mesure stable.
    canManageComplaints && listerDetail
      ? prisma.complaint.findMany({
          where: { organizationId: session.organizationId, status: "resolved", resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const nomParMembre = new Map(members.map((m) => [m.id, m.name] as [string, string]));
  function nommerDestinataires(ids: string[]): string {
    return ids.map((id) => nomParMembre.get(id) ?? "Membre retiré").join(", ");
  }

  const avgResolutionDays =
    resolvedComplaints.length > 0
      ? Math.round(
          resolvedComplaints.reduce((sum, c) => sum + (c.resolvedAt!.getTime() - c.createdAt.getTime()) / (24 * 60 * 60 * 1000), 0) /
            resolvedComplaints.length
        )
      : null;

  const myRightsRequests =
    session.role === "LEARNER" && !showArchived && !showSuivi
      ? await prisma.rightsRequest.findMany({
          where: { organizationId: session.organizationId, submittedByUserId: session.userId },
          orderBy: { createdAt: "desc" },
        })
      : [];

  let secureReports: Awaited<ReturnType<typeof prisma.secureReport.findMany>> = [];
  let nbSecureReports = 0;
  let accessLogByReport = new Map<string, { viewedByName: string; viewedAt: Date }[]>();
  if (canViewSecureReports && listerDetail) {
    const whereReports: Prisma.SecureReportWhereInput = {
      organizationId: session.organizationId,
      archivedAt: showArchived ? { not: null } : null,
    };
    const [lot, total] = await Promise.all([
      prisma.secureReport.findMany({ where: whereReports, orderBy: { createdAt: "desc" }, take: MAX_LIGNES_DETAILLEES }),
      prisma.secureReport.count({ where: whereReports }),
    ]);
    secureReports = lot;
    nbSecureReports = total;
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
      <PageHeader title="Aide & demandes" subtitle="Réclamations, signalement confidentiel, questions et demandes RGPD" />
      {peutSuivre && <Tabs basePath="/support" tabs={TABS} active={activeTab} />}

      {showSuivi ? (
        <div className="p-8 flex flex-col gap-4 max-w-4xl">
          <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">Toutes les demandes en cours ({totalSuivi})</div>
                <div className="text-[11.5px] text-slate mt-0.5">
                  Réclamations{canViewSecureReports ? " et signalements confidentiels" : ""}{" "}— la ligne change d&apos;état
                  dès que le responsable enregistre « {canViewSecureReports ? "Résolue / Clos" : "Résolue"}{" "}». Les demandes
                  archivées n&apos;y figurent pas.
                </div>
              </div>
              <SearchInput placeholder="Sujet, demandeur, responsable…" />
            </div>
            <SupportTrackingTable lignes={lignesSuivi} />
            <Pagination
              basePath="/support"
              searchParams={{ tab: activeTab, q: q || undefined }}
              page={page}
              totalPages={totalPagesSuivi}
            />
            {canViewSecureReports && (
              <div className="text-[11px] text-slate">
                Les signalements confidentiels apparaissent sans leur contenu ni l&apos;identité de leur auteur : ils se
                lisent depuis l&apos;onglet « Demandes », où chaque consultation est tracée.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 flex flex-col gap-6 max-w-2xl">
          {!showArchived && !recoitLesDemandes && (
            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-1">Une question, un problème ?</div>
              <div className="text-[11.5px] text-slate mb-3.5">
                Réclamation, signalement confidentiel, question générale, ou demande sur vos données personnelles — un
                seul endroit pour nous contacter, votre demande sera transmise à la bonne personne.
              </div>
              <SupportRequestDialog
                dossiers={myDossiers.map((d) => ({ id: d.id, label: d.session.course.title }))}
                canRequestOwnRights={session.role === "LEARNER"}
              />
            </div>
          )}

          {session.role === "LEARNER" && myRightsRequests.length > 0 && (
            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-3.5">Vos demandes sur vos données personnelles</div>
              {myRightsRequests.map((r) => (
                <div key={r.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[13px] text-ink font-medium">{RIGHTS_TYPE_LABELS[r.requestType] ?? r.requestType}</div>
                    <Pill tone={RIGHTS_STATUS_TONE[r.status] ?? "warn"}>{RIGHTS_STATUS_LABELS[r.status] ?? r.status}</Pill>
                  </div>
                  <div className="text-[11.5px] text-slate">
                    Envoyée le {format(r.createdAt, "d MMM yyyy", { locale: fr })} · réponse attendue avant le{" "}
                    {format(r.deadline, "d MMM yyyy", { locale: fr })}
                  </div>
                  {r.details && <div className="text-[12.5px] text-ink">{r.details}</div>}
                </div>
              ))}
            </div>
          )}

          {canManageComplaints && (
            <div className="bg-white border border-line rounded-card p-5">
              <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
                <div className="text-[13.5px] font-semibold text-ink">
                  {showArchived ? "Réclamations archivées" : "Réclamations reçues"} ({nbComplaints})
                </div>
                {avgResolutionDays !== null && (
                  <div className="text-[11.5px] text-slate">
                    Délai moyen de traitement : <span className="text-ink font-medium">{avgResolutionDays} jour{avgResolutionDays > 1 ? "s" : ""}</span>{" "}
                    (sur {resolvedComplaints.length} résolue{resolvedComplaints.length > 1 ? "s" : ""})
                  </div>
                )}
              </div>
              {nbComplaints > complaints.length && (
                <div className="text-[11.5px] text-slate mb-2">
                  Les {complaints.length} plus récentes sont détaillées ici — la liste complète est dans le tableau de suivi.
                </div>
              )}
              {complaints.map((c) => (
                <div key={c.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[13px] text-ink font-medium">{c.subject}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Pill tone={URGENCY_TONE[normaliserUrgence(c.urgency)]}>{URGENCY_LABELS[normaliserUrgence(c.urgency)]}</Pill>
                      <Pill tone={COMPLAINT_STATUS_TONE[c.status] ?? "warn"}>{COMPLAINT_STATUS_LABELS[c.status] ?? c.status}</Pill>
                    </div>
                  </div>
                  <div className="text-[11.5px] text-slate">
                    {format(c.createdAt, "d MMM yyyy", { locale: fr })} ·{" "}
                    {c.submittedByEmail ? (
                      <a href={`mailto:${c.submittedByEmail}`} className="text-ink underline decoration-line hover:decoration-ink">
                        {c.submittedByName}
                      </a>
                    ) : (
                      c.submittedByName
                    )}
                  </div>
                  <div className="text-[12.5px] text-ink">{c.description}</div>
                  {c.resolutionNotes && <div className="text-[12.5px] text-ink"><span className="text-slate">Résolution : </span>{c.resolutionNotes}</div>}
                  {c.assignedToName && (
                    <div className="text-[11.5px] text-slate">
                      Responsable : {c.assignedToName}
                      {c.assigneeDeadline && ` · à traiter avant le ${format(c.assigneeDeadline, "d MMM yyyy", { locale: fr })}`}
                      {c.assigneeComment && ` · ${c.assigneeComment}`}
                    </div>
                  )}
                  {c.notifyUserIds.length > 0 && (
                    <div className="text-[11.5px] text-slate">Également prévenus : {nommerDestinataires(c.notifyUserIds)}</div>
                  )}
                  <ComplaintStatusForm
                    complaintId={c.id}
                    status={c.status}
                    resolutionNotes={c.resolutionNotes}
                    subject={c.subject}
                    proofFileName={c.proofFileName}
                    hasProof={Boolean(c.proofFileUrl)}
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    {c.submittedByEmail && <ReplyToComplaintDialog complaintId={c.id} />}
                    <ArchiveSupportItemButton kind="complaints" itemId={c.id} archived={Boolean(c.archivedAt)} />
                  </div>
                  <AssignSupportItemForm
                    kind="complaints"
                    itemId={c.id}
                    members={members}
                    initial={{
                      assignedToUserId: c.assignedToUserId,
                      assigneeComment: c.assigneeComment,
                      assigneeDeadline: c.assigneeDeadline,
                      urgency: c.urgency,
                      notifyUserIds: c.notifyUserIds,
                    }}
                  />
                </div>
              ))}
              {complaints.length === 0 && (
                <div className="text-[12.5px] text-slate">{showArchived ? "Aucune réclamation archivée." : "Aucune réclamation."}</div>
              )}
            </div>
          )}

          {canViewSecureReports && (
            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-3.5">
                {showArchived ? "Signalements archivés" : "Signalements reçus"} ({nbSecureReports})
              </div>
              {nbSecureReports > secureReports.length && (
                <div className="text-[11.5px] text-slate mb-2">
                  Les {secureReports.length} plus récents sont détaillés ici — la liste complète est dans le tableau de suivi.
                </div>
              )}
              {secureReports.map((r) => (
                <div key={r.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] text-slate">
                      {format(r.createdAt, "d MMM yyyy HH:mm", { locale: fr })} ·{" "}
                      {r.reporterName ? r.reporterName : "Anonyme"}
                      {r.reporterContact && ` · ${r.reporterContact}`}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Pill tone={URGENCY_TONE[normaliserUrgence(r.urgency)]}>{URGENCY_LABELS[normaliserUrgence(r.urgency)]}</Pill>
                      <Pill tone={REPORT_STATUS_TONE[r.status] ?? "warn"}>{REPORT_STATUS_LABELS[r.status] ?? r.status}</Pill>
                    </div>
                  </div>
                  <div className="text-[12.5px] text-ink">{r.description}</div>
                  {r.escalationNotes && <div className="text-[12.5px] text-ink"><span className="text-slate">Suivi : </span>{r.escalationNotes}</div>}
                  {r.assignedToName && (
                    <div className="text-[11.5px] text-slate">
                      Responsable : {r.assignedToName}
                      {r.assigneeDeadline && ` · à traiter avant le ${format(r.assigneeDeadline, "d MMM yyyy", { locale: fr })}`}
                      {r.assigneeComment && ` · ${r.assigneeComment}`}
                    </div>
                  )}
                  {r.notifyUserIds.length > 0 && (
                    <div className="text-[11.5px] text-slate">Également prévenus : {nommerDestinataires(r.notifyUserIds)}</div>
                  )}
                  <SecureReportStatusForm
                    reportId={r.id}
                    status={r.status}
                    escalationNotes={r.escalationNotes}
                    proofFileName={r.proofFileName}
                    hasProof={Boolean(r.proofFileUrl)}
                  />
                  <ArchiveSupportItemButton kind="secure-reports" itemId={r.id} archived={Boolean(r.archivedAt)} />
                  <AssignSupportItemForm
                    kind="secure-reports"
                    itemId={r.id}
                    members={members}
                    initial={{
                      assignedToUserId: r.assignedToUserId,
                      assigneeComment: r.assigneeComment,
                      assigneeDeadline: r.assigneeDeadline,
                      urgency: r.urgency,
                      notifyUserIds: r.notifyUserIds,
                    }}
                  />
                  <div className="text-[11px] text-slate">
                    Consulté par : {(accessLogByReport.get(r.id) ?? []).map((l) => `${l.viewedByName} (${format(l.viewedAt, "d MMM HH:mm", { locale: fr })})`).join(", ") || "—"}
                  </div>
                </div>
              ))}
              {secureReports.length === 0 && (
                <div className="text-[12.5px] text-slate">{showArchived ? "Aucun signalement archivé." : "Aucun signalement."}</div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
