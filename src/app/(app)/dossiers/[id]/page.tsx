import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { CheckCircle2, Circle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireSessionContext, can, canWriteRgpd } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { Tabs } from "@/components/Tabs";
import { DossierCategorySelect } from "@/components/DossierCategorySelect";
import { AddDossierDocumentForm } from "@/components/AddDossierDocumentForm";
import { CreateRightsRequestButton } from "@/components/CreateRightsRequestButton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const TABS = [
  { key: "info", label: "Info" },
  { key: "emails", label: "Emails" },
  { key: "documents", label: "Documents" },
  { key: "donnees-personnelles", label: "Données personnelles" },
  { key: "preuves-qualiopi", label: "Preuves Qualiopi" },
];

export default async function DossierPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none") redirect("/dashboard");
  const canEditCategory = can(role, "dossiers") === "full";
  const activeTab = searchParams.tab ?? "info";

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) notFound();
  if (role === Role.TRAINER && dossier.session.trainerId !== userId) redirect("/dossiers");

  return (
    <>
      <PageHeader title={`${dossier.contact.firstName} ${dossier.contact.lastName}`} subtitle={dossier.session.course.title} />
      <Tabs basePath={`/dossiers/${dossier.id}`} tabs={TABS} active={activeTab} />
      <div className="p-8 max-w-xl">
        {activeTab === "emails" ? (
          <EmailsTab contactId={dossier.contactId} />
        ) : activeTab === "documents" ? (
          <DocumentsTab dossierId={dossier.id} canWrite={can(role, "dossiers") !== "none"} />
        ) : activeTab === "donnees-personnelles" ? (
          <PersonalDataTab dossier={dossier} canWrite={canWriteRgpd(role)} />
        ) : activeTab === "preuves-qualiopi" ? (
          <QualiopiEvidenceTab dossierId={dossier.id} />
        ) : (
          <InfoTab dossier={dossier} canEditCategory={canEditCategory} />
        )}
      </div>
    </>
  );
}

function InfoTab({
  dossier,
  canEditCategory,
}: {
  dossier: { id: string; needsAssessmentDone: boolean; contractSigned: boolean; convocationSent: boolean; evaluationHotDone: boolean; evaluationColdDone: boolean; learnerCategory: string | null };
  canEditCategory: boolean;
}) {
  const steps = [
    { label: "Recueil des besoins", done: dossier.needsAssessmentDone },
    { label: "Convention signée", done: dossier.contractSigned },
    { label: "Convocation envoyée", done: dossier.convocationSent },
    { label: "Évaluation à chaud", done: dossier.evaluationHotDone },
    { label: "Évaluation à froid", done: dossier.evaluationColdDone },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-line rounded-card p-5">
        <div className="text-[13.5px] font-semibold text-ink mb-3">Parcours de formation</div>
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 py-2 border-t border-line first:border-t-0">
            {s.done ? <CheckCircle2 size={16} className="text-sage" /> : <Circle size={16} className="text-[#C9C4B5]" />}
            <div className={`text-[13px] ${s.done ? "text-ink" : "text-slate"}`}>{s.label}</div>
          </div>
        ))}
      </div>
      {canEditCategory && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[12.5px] text-slate mb-2">Catégorie légale de l&apos;apprenant (pour le BPF)</div>
          <DossierCategorySelect dossierId={dossier.id} learnerCategory={dossier.learnerCategory} />
        </div>
      )}
    </div>
  );
}

async function EmailsTab({ contactId }: { contactId: string }) {
  const emails = await prisma.emailMessage.findMany({ where: { contactId }, orderBy: { receivedAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Échanges par email</div>
      {emails.map((m) => (
        <div key={m.id} className="py-3 border-t border-line first:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12.5px] text-ink font-medium">{m.subject}</div>
            <div className="text-[11px] text-slate shrink-0">{format(m.receivedAt, "d MMM yyyy", { locale: fr })}</div>
          </div>
          <div className="text-[12px] text-slate mt-0.5">{m.snippet}</div>
        </div>
      ))}
      {emails.length === 0 && <div className="text-[12.5px] text-slate">Aucun email rattaché à ce contact.</div>}
    </div>
  );
}

async function DocumentsTab({ dossierId, canWrite }: { dossierId: string; canWrite: boolean }) {
  const documents = await prisma.document.findMany({ where: { dossierId }, orderBy: { createdAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Documents</div>
      {documents.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-line first:border-t-0">
          <a
            href={d.bodyText ? `/api/documents/generated/${d.id}` : d.fileUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink"
          >
            {d.title}
          </a>
          {d.templateOrigin && <Pill tone="neutral">{d.templateOrigin}</Pill>}
        </div>
      ))}
      {documents.length === 0 && <div className="text-[12.5px] text-slate py-2">Aucun document.</div>}
      {canWrite && (
        <div className="mt-3.5 pt-3.5 border-t border-line">
          <AddDossierDocumentForm dossierId={dossierId} />
        </div>
      )}
    </div>
  );
}

function PersonalDataTab({
  dossier,
  canWrite,
}: {
  dossier: { id: string; legalBasis: string; retentionUntil: Date | null };
  canWrite: boolean;
}) {
  return (
    <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
      <div>
        <div className="text-[12.5px] text-slate mb-1">Base légale</div>
        <div className="text-[13px] text-ink">{dossier.legalBasis}</div>
      </div>
      <div>
        <div className="text-[12.5px] text-slate mb-1">Purge prévue</div>
        <div className="text-[13px] text-ink">
          {dossier.retentionUntil ? format(dossier.retentionUntil, "d MMMM yyyy", { locale: fr }) : "Non planifiée"}
        </div>
      </div>
      {canWrite && (
        <div className="pt-2 border-t border-line">
          <div className="text-[12.5px] text-slate mb-2">Exercice des droits</div>
          <CreateRightsRequestButton dossierId={dossier.id} />
        </div>
      )}
    </div>
  );
}

async function QualiopiEvidenceTab({ dossierId }: { dossierId: string }) {
  const evidence = await prisma.qualiopiIndicatorEvidence.findMany({ where: { dossierId }, orderBy: { indicatorNumber: "asc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Preuves Qualiopi rattachées</div>
      {evidence.map((e) => (
        <div key={e.id} className="py-2.5 border-t border-line first:border-t-0">
          <div className="text-[12.5px] text-ink">
            Indicateur {e.indicatorNumber} (critère {e.criterionNumber})
          </div>
          {e.evidenceNote && <div className="text-[12px] text-slate mt-0.5">{e.evidenceNote}</div>}
        </div>
      ))}
      {evidence.length === 0 && <div className="text-[12.5px] text-slate">Aucune preuve rattachée à ce dossier.</div>}
    </div>
  );
}
