import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { CheckCircle2, Circle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireSessionContext, can, canWriteRgpd, canManageSessionInvitations, canAccessAccommodations } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { Tabs } from "@/components/Tabs";
import { DossierCategorySelect } from "@/components/DossierCategorySelect";
import { AddDossierDocumentForm } from "@/components/AddDossierDocumentForm";
import { CreateRightsRequestButton } from "@/components/CreateRightsRequestButton";
import { EmailReplyComposer } from "@/components/EmailReplyComposer";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";
import { SendOutreachButtons } from "@/components/SendOutreachButtons";
import { MarkContractSignedButton } from "@/components/MarkContractSignedButton";
import { AccommodationForm } from "@/components/AccommodationForm";
import { AccommodationStatusForm } from "@/components/AccommodationStatusForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const OUTREACH_LABELS: Record<string, string> = {
  contract: "Contrat",
  platform_access: "Accès plateforme",
};

const BASE_TABS = [
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
  const canManageEmail = can(role, "inbox") !== "none";
  const activeTab = searchParams.tab ?? "info";

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) notFound();
  if (role === Role.TRAINER && dossier.session.trainerId !== userId) redirect("/dossiers");

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const canAccessAccomm = canAccessAccommodations(role, userId, organization);
  const TABS = canAccessAccomm ? [...BASE_TABS, { key: "accessibilite", label: "Accessibilité" }] : BASE_TABS;
  if (activeTab === "accessibilite" && !canAccessAccomm) redirect(`/dossiers/${dossier.id}`);

  const members = canManageEmail
    ? await prisma.user.findMany({
        where: { organizationId, status: "active", role: { not: Role.LEARNER } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const outreaches = await prisma.clientOutreach.findMany({
    where: { dossierId: dossier.id },
    orderBy: { sentAt: "desc" },
  });
  const canConvocation = canManageSessionInvitations(role, userId, dossier.session);

  return (
    <>
      <PageHeader title={`${dossier.contact.firstName} ${dossier.contact.lastName}`} subtitle={dossier.session.course.title} />
      <Tabs basePath={`/dossiers/${dossier.id}`} tabs={TABS} active={activeTab} />
      <div className="p-8 max-w-xl">
        {activeTab === "emails" ? (
          <EmailsTab contactId={dossier.contactId} canManageEmail={canManageEmail} members={members} />
        ) : activeTab === "documents" ? (
          <DocumentsTab dossierId={dossier.id} canWrite={can(role, "dossiers") !== "none"} />
        ) : activeTab === "donnees-personnelles" ? (
          <PersonalDataTab dossier={dossier} canWrite={canWriteRgpd(role)} />
        ) : activeTab === "preuves-qualiopi" ? (
          <QualiopiEvidenceTab dossierId={dossier.id} />
        ) : activeTab === "accessibilite" ? (
          <AccessibilityTab dossierId={dossier.id} />
        ) : (
          <InfoTab
            dossier={dossier}
            canEditCategory={canEditCategory}
            canManageOutreach={can(role, "dossiers") !== "none"}
            canConvocation={canConvocation}
            outreaches={outreaches}
          />
        )}
      </div>
    </>
  );
}

function InfoTab({
  dossier,
  canEditCategory,
  canManageOutreach,
  canConvocation,
  outreaches,
}: {
  dossier: { id: string; needsAssessmentDone: boolean; contractSigned: boolean; convocationSent: boolean; evaluationHotDone: boolean; evaluationColdDone: boolean; learnerCategory: string | null };
  canEditCategory: boolean;
  canManageOutreach: boolean;
  canConvocation: boolean;
  outreaches: { id: string; type: string; status: string; sentAt: Date; sentByName: string }[];
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
      {(canManageOutreach || canConvocation) && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3">Communications</div>
          <SendOutreachButtons dossierId={dossier.id} showConvocation={canConvocation} />
          {outreaches.length > 0 && (
            <div className="mt-3.5 pt-3.5 border-t border-line flex flex-col gap-2">
              {outreaches.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <div className="text-ink">
                    {OUTREACH_LABELS[o.type] ?? o.type} — envoyé le {format(o.sentAt, "d MMM yyyy", { locale: fr })} par {o.sentByName}
                  </div>
                  {o.status === "acknowledged" ? (
                    <Pill tone="good">{o.type === "platform_access" ? "Activé" : "Signé"}</Pill>
                  ) : o.type === "contract" && canManageOutreach ? (
                    <MarkContractSignedButton outreachId={o.id} />
                  ) : (
                    <Pill tone="neutral">En attente</Pill>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {canEditCategory && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[12.5px] text-slate mb-2">Catégorie légale de l&apos;apprenant (pour le BPF)</div>
          <DossierCategorySelect dossierId={dossier.id} learnerCategory={dossier.learnerCategory} />
        </div>
      )}
    </div>
  );
}

async function EmailsTab({
  contactId,
  canManageEmail,
  members,
}: {
  contactId: string;
  canManageEmail: boolean;
  members: { id: string; name: string }[];
}) {
  const emails = await prisma.emailMessage.findMany({ where: { contactId }, orderBy: { receivedAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Échanges par email</div>
      {emails.map((m) => (
        <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12.5px] text-ink font-medium">
              {m.direction === "out" && <span className="text-slate font-normal">Vous — </span>}
              {m.subject}
            </div>
            <div className="text-[11px] text-slate shrink-0">{format(m.receivedAt, "d MMM yyyy", { locale: fr })}</div>
          </div>
          <div className="text-[12px] text-slate whitespace-pre-wrap">{m.body ?? m.snippet}</div>
          {canManageEmail && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-slate">Assigné à</span>
              <AssignEmailSelect messageId={m.id} members={members} assignedToUserId={m.assignedToUserId} />
            </div>
          )}
          {canManageEmail && m.direction === "in" && <EmailReplyComposer messageId={m.id} />}
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

const ACCOMMODATION_STATUS_LABELS: Record<string, string> = { pending: "En attente", granted: "Accordé", declined: "Refusé" };
const ACCOMMODATION_STATUS_TONE: Record<string, "warn" | "good" | "danger"> = { pending: "warn", granted: "good", declined: "danger" };

// Only reachable when canAccessAccommodations() already passed on the page
// component — this tab is never rendered (and the route redirects away
// from ?tab=accessibilite) for anyone else, since the content itself is
// RGPD art. 9 special-category data.
async function AccessibilityTab({ dossierId }: { dossierId: string }) {
  const requests = await prisma.accommodationRequest.findMany({ where: { dossierId }, orderBy: { createdAt: "desc" } });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13.5px] font-semibold text-ink">Aménagements — situation de handicap</div>
      </div>
      <div className="text-[11.5px] text-slate mb-3.5">
        Informations confidentielles, visibles uniquement par les administrateurs et le référent handicap désigné.
      </div>
      {requests.map((r) => (
        <div key={r.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-slate">{format(r.createdAt, "d MMM yyyy", { locale: fr })} · {r.createdByName}</div>
            <Pill tone={ACCOMMODATION_STATUS_TONE[r.status] ?? "warn"}>{ACCOMMODATION_STATUS_LABELS[r.status] ?? r.status}</Pill>
          </div>
          <div className="text-[12.5px] text-ink"><span className="text-slate">Situation : </span>{r.description}</div>
          <div className="text-[12.5px] text-ink"><span className="text-slate">Demande : </span>{r.requestedAccommodations}</div>
          {r.grantedAccommodations && (
            <div className="text-[12.5px] text-ink"><span className="text-slate">Accordé : </span>{r.grantedAccommodations}</div>
          )}
          <AccommodationStatusForm dossierId={dossierId} requestId={r.id} status={r.status} grantedAccommodations={r.grantedAccommodations} />
        </div>
      ))}
      {requests.length === 0 && <div className="text-[12.5px] text-slate py-2">Aucune demande enregistrée.</div>}
      <div className="mt-3.5 pt-3.5 border-t border-line">
        <AccommodationForm dossierId={dossierId} />
      </div>
    </div>
  );
}
