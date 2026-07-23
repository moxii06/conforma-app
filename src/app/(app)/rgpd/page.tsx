import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, canWriteRgpd, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { AddProcessingActivityForm } from "@/components/AddProcessingActivityForm";
import { AddDpiaForm } from "@/components/AddDpiaForm";
import { AddSubProcessorForm } from "@/components/AddSubProcessorForm";
import { AddRightsRequestForm } from "@/components/AddRightsRequestForm";
import { RightsRequestControls } from "@/components/RightsRequestControls";
import { AddDataBreachDialog } from "@/components/AddDataBreachDialog";
import { DataBreachControls } from "@/components/DataBreachControls";
import { format, differenceInHours } from "date-fns";
import { fr } from "date-fns/locale";

const TABS = [
  { key: "registre", label: "Registre des traitements" },
  { key: "dpia", label: "DPIA / AIPD" },
  { key: "sous-traitants", label: "Sous-traitants & DPA" },
  { key: "droits", label: "Demandes de droits" },
  { key: "violations", label: "Violations de données" },
];

const BREACH_STATUS_LABELS: Record<string, string> = { investigating: "En cours d'analyse", contained: "Maîtrisée", closed: "Clôturée" };
const BREACH_SEVERITY_LABELS: Record<string, string> = { low: "Faible", moderate: "Modérée", high: "Élevée" };

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Accès",
  erasure: "Effacement",
  portability: "Portabilité",
  rectification: "Rectification",
};

const STATUS_LABELS: Record<string, string> = { open: "Ouverte", in_progress: "En cours", closed: "Clôturée" };
const RISK_LEVEL_LABELS: Record<string, string> = { low: "Faible", moderate: "Modéré", high: "Élevé" };
const DPIA_STATUS_LABELS: Record<string, string> = {
  required: "Requise",
  in_progress: "En cours",
  validated: "Validée",
  not_required: "Non requise",
};

export default async function RgpdPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "rgpd") === "none") redirect("/dashboard");
  const activeTab = searchParams.tab ?? "registre";
  const canWrite = canWriteRgpd(session.role);

  return (
    <>
      <PageHeader title="Registre RGPD" subtitle="Documentation et preuves de conformité" />
      <Tabs basePath="/rgpd" tabs={TABS} active={activeTab} />
      <div className="p-8">
        {activeTab === "dpia" ? (
          <DpiaTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : activeTab === "sous-traitants" ? (
          <SubProcessorsTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : activeTab === "droits" ? (
          <RightsRequestsTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : activeTab === "violations" ? (
          <DataBreachesTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : (
          <RegisterTab organizationId={session.organizationId} canWrite={canWrite} />
        )}
      </div>
    </>
  );
}

async function RegisterTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const activities = await prisma.processingActivity.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Registre des traitements</div>
      <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[2]">Traitement</div>
        <div className="flex-[1.4]">Base légale</div>
        <div className="flex-1">Conservation</div>
        <div className="flex-[0.6]">Statut</div>
      </div>
      {activities.map((a) => (
        <div key={a.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
          <div className="flex-[2]">{a.name}</div>
          <div className="flex-[1.4] text-slate">{a.legalBasis}</div>
          <div className="flex-1 text-slate">{a.retentionPeriod}</div>
          <div className="flex-[0.6]">
            <Pill tone={a.riskFlag === "ok" ? "good" : "warn"}>{a.riskFlag === "ok" ? "À jour" : "À revoir"}</Pill>
          </div>
        </div>
      ))}
      {activities.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucun traitement enregistré.</div>}

      {canWrite && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[12.5px] font-semibold text-ink mb-3">Ajouter un traitement</div>
          <AddProcessingActivityForm />
        </div>
      )}
    </div>
  );
}

async function DpiaTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const [records, activities] = await Promise.all([
    prisma.dPIARecord.findMany({
      where: { organizationId },
      include: { processingActivity: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.processingActivity.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Analyses d&apos;impact (DPIA / AIPD)</div>
      <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[1.6]">Traitement lié</div>
        <div className="flex-[2]">Objet</div>
        <div className="flex-1">Risque</div>
        <div className="flex-1">Statut</div>
      </div>
      {records.map((r) => (
        <div key={r.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
          <div className="flex-[1.6]">{r.processingActivity.name}</div>
          <div className="flex-[2] text-slate">{r.subject}</div>
          <div className="flex-1">
            <Pill tone={r.riskLevel === "high" ? "danger" : r.riskLevel === "moderate" ? "warn" : "good"}>
              {RISK_LEVEL_LABELS[r.riskLevel] ?? r.riskLevel}
            </Pill>
          </div>
          <div className="flex-1">
            <Pill tone={r.status === "validated" ? "good" : r.status === "not_required" ? "neutral" : "warn"}>
              {DPIA_STATUS_LABELS[r.status] ?? r.status}
            </Pill>
          </div>
        </div>
      ))}
      {records.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune DPIA enregistrée.</div>}

      {canWrite &&
        (activities.length > 0 ? (
          <div className="mt-5 pt-5 border-t border-line">
            <div className="text-[12.5px] font-semibold text-ink mb-3">Ajouter une DPIA</div>
            <AddDpiaForm activities={activities} />
          </div>
        ) : (
          <div className="mt-5 pt-5 border-t border-line text-[12.5px] text-slate">
            Ajoutez d&apos;abord un traitement dans le registre pour pouvoir lui associer une DPIA.
          </div>
        ))}
    </div>
  );
}

async function SubProcessorsTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const subProcessors = await prisma.subProcessor.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Sous-traitants & accords de traitement (DPA)</div>
      <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[1.4]">Prestataire</div>
        <div className="flex-[1.4]">Rôle</div>
        <div className="flex-1">Localisation</div>
        <div className="flex-[0.8]">DPA</div>
      </div>
      {subProcessors.map((s) => (
        <div key={s.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
          <div className="flex-[1.4]">{s.name}</div>
          <div className="flex-[1.4] text-slate">{s.role}</div>
          <div className="flex-1 text-slate">{s.location}</div>
          <div className="flex-[0.8]">
            <Pill tone={s.dpaStatus === "signed" ? "good" : "warn"}>{s.dpaStatus === "signed" ? "Signé" : "En attente"}</Pill>
          </div>
        </div>
      ))}
      {subProcessors.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucun sous-traitant enregistré.</div>}

      {canWrite && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[12.5px] font-semibold text-ink mb-3">Ajouter un sous-traitant</div>
          <AddSubProcessorForm />
        </div>
      )}
    </div>
  );
}

async function RightsRequestsTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const [requests, members] = await Promise.all([
    prisma.rightsRequest.findMany({
      where: { organizationId },
      orderBy: { deadline: "asc" },
    }),
    canWrite
      ? prisma.user.findMany({
          where: { organizationId, status: "active", role: { not: "LEARNER" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const now = new Date();

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Demandes d&apos;exercice des droits</div>
      <div className="flex items-center text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[1.2]">Type</div>
        <div className="flex-[1.6]">Personne</div>
        <div className="flex-1">Échéance</div>
        <div className={canWrite ? "flex-[1.6]" : "flex-[0.8]"}>{canWrite ? "Assignation & statut" : "Statut"}</div>
      </div>
      {requests.map((r) => {
        const overdue = r.status !== "closed" && r.deadline < now;
        return (
          <div key={r.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
            <div className="flex-[1.2]">{REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}</div>
            <div className="flex-[1.6] text-slate">{r.personLabel}</div>
            <div className="flex-1 text-slate">{format(r.deadline, "d MMM yyyy", { locale: fr })}</div>
            <div className={canWrite ? "flex-[1.6]" : "flex-[0.8]"}>
              {canWrite ? (
                <div className="flex items-center gap-2">
                  <RightsRequestControls requestId={r.id} status={r.status} assignedToUserId={r.assignedToUserId} members={members} />
                  {overdue && <Pill tone="danger">En retard</Pill>}
                </div>
              ) : (
                <Pill tone={overdue ? "danger" : r.status === "closed" ? "good" : "neutral"}>
                  {overdue ? "En retard" : STATUS_LABELS[r.status] ?? r.status}
                </Pill>
              )}
            </div>
          </div>
        );
      })}
      {requests.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune demande enregistrée.</div>}

      {canWrite && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[12.5px] font-semibold text-ink mb-3">Enregistrer une demande</div>
          <AddRightsRequestForm />
        </div>
      )}
    </div>
  );
}

async function DataBreachesTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const breaches = await prisma.dataBreach.findMany({
    where: { organizationId },
    orderBy: { discoveredAt: "desc" },
  });
  const now = new Date();

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13.5px] font-semibold text-ink">Violations de données</div>
        {canWrite && <AddDataBreachDialog />}
      </div>
      <div className="text-[11.5px] text-slate mb-3.5">
        Registre des incidents de sécurité affectant des données personnelles (art. 33/34 RGPD) — distinct du registre
        des traitements et des DPIA, qui couvrent le risque anticipé plutôt que ce qui s&apos;est réellement produit.
      </div>
      {breaches.map((b) => {
        const hoursSinceDiscovery = differenceInHours(now, b.discoveredAt);
        const notificationOverdue = !b.notifiedAuthorityAt && hoursSinceDiscovery > 72 && b.status !== "closed";
        return (
          <div key={b.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-ink">{b.title}</div>
              <div className="flex items-center gap-1.5 shrink-0">
                {notificationOverdue && <Pill tone="danger">Notification CNIL en retard</Pill>}
                <Pill tone={b.severity === "high" ? "danger" : b.severity === "moderate" ? "warn" : "neutral"}>
                  {BREACH_SEVERITY_LABELS[b.severity] ?? b.severity}
                </Pill>
              </div>
            </div>
            <div className="text-[12px] text-slate">
              Découverte le {format(b.discoveredAt, "d MMM yyyy 'à' HH:mm", { locale: fr })} · {b.affectedDataTypes}
              {b.affectedPeopleCount !== null && ` · ~${b.affectedPeopleCount} personne${b.affectedPeopleCount > 1 ? "s" : ""} concernée${b.affectedPeopleCount > 1 ? "s" : ""}`}
            </div>
            <div className="text-[12.5px] text-ink">{b.description}</div>
            {canWrite ? (
              <DataBreachControls breachId={b.id} status={b.status} notifiedAuthorityAt={b.notifiedAuthorityAt} notifiedSubjectsAt={b.notifiedSubjectsAt} />
            ) : (
              <div className="text-[11.5px] text-slate">{BREACH_STATUS_LABELS[b.status] ?? b.status}</div>
            )}
          </div>
        );
      })}
      {breaches.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucun incident enregistré.</div>}
    </div>
  );
}
