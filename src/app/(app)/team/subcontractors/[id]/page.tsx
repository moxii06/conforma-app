import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { EditSubcontractorForm } from "@/components/EditSubcontractorForm";
import { SubcontractorStatusSelect } from "@/components/SubcontractorStatusSelect";
import { AddSubcontractorDocumentForm } from "@/components/AddSubcontractorDocumentForm";
import { InviteSubcontractorButton } from "@/components/InviteSubcontractorButton";
import { DeleteSubcontractorButton } from "@/components/DeleteSubcontractorButton";
import { DocumentActions } from "@/components/DocumentActions";
import { CATEGORY_LABELS } from "@/lib/documentCategories";

const SUBCONTRACTOR_TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};

export default async function SubcontractorRecordPage({ params }: { params: { id: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "team") !== "full") redirect("/dashboard");

  const subcontractor = await prisma.subcontractor.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      linkedUser: { select: { id: true, name: true, status: true } },
      courses: { orderBy: { title: "asc" } },
    },
  });
  if (!subcontractor) notFound();

  const activeDocuments = subcontractor.documents.filter((d) => !d.archivedAt);
  const archivedDocuments = subcontractor.documents.filter((d) => d.archivedAt);

  return (
    <>
      <PageHeader title={subcontractor.name} subtitle={SUBCONTRACTOR_TYPE_LABELS[subcontractor.type] ?? subcontractor.type} />
      <div className="p-8 flex flex-col gap-5 max-w-3xl">
        <Link href="/team?tab=prestataires" className="text-[12px] text-slate hover:text-ink w-fit">
          ← Retour à l&apos;équipe
        </Link>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-semibold text-ink">Informations</div>
            <div className="flex items-center gap-3">
              <EditSubcontractorForm
                subcontractorId={subcontractor.id}
                initial={{
                  name: subcontractor.name,
                  type: subcontractor.type,
                  isIndividual: subcontractor.isIndividual,
                  legalForm: subcontractor.legalForm,
                  siret: subcontractor.siret,
                  address: subcontractor.address,
                  contactEmail: subcontractor.contactEmail,
                  contactPhone: subcontractor.contactPhone,
                  qualifications: subcontractor.qualifications,
                }}
              />
              <DeleteSubcontractorButton subcontractorId={subcontractor.id} name={subcontractor.name} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Statut</div>
              <SubcontractorStatusSelect subcontractorId={subcontractor.id} status={subcontractor.status} />
            </div>
            <div>
              <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Forme</div>
              <div className="text-ink">
                {subcontractor.isIndividual ? "Entreprise individuelle" : subcontractor.legalForm || "—"}
              </div>
            </div>
            {subcontractor.siret && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">SIRET</div>
                <div className="text-ink">{subcontractor.siret}</div>
              </div>
            )}
            {subcontractor.address && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Adresse</div>
                <div className="text-ink">{subcontractor.address}</div>
              </div>
            )}
            {subcontractor.contactEmail && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Email de contact</div>
                <div className="text-ink">{subcontractor.contactEmail}</div>
              </div>
            )}
            {subcontractor.contactPhone && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Téléphone</div>
                <div className="text-ink">{subcontractor.contactPhone}</div>
              </div>
            )}
            {subcontractor.contractEndDate && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Contrat jusqu&apos;au</div>
                <div className="text-ink">{format(subcontractor.contractEndDate, "d MMM yyyy", { locale: fr })}</div>
              </div>
            )}
            {subcontractor.qualificationExpiryDate && (
              <div>
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Qualification valable jusqu&apos;au</div>
                <div className="text-ink">{format(subcontractor.qualificationExpiryDate, "d MMM yyyy", { locale: fr })}</div>
              </div>
            )}
          </div>
          {subcontractor.qualifications && (
            <div>
              <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Qualifications</div>
              <div className="text-[12.5px] text-ink">{subcontractor.qualifications}</div>
            </div>
          )}
          <div className="pt-1 border-t border-line">
            {subcontractor.linkedUser ? (
              <span className="text-[11.5px] text-sage">
                Compte plateforme : {subcontractor.linkedUser.status === "active" ? "actif" : "invité, en attente d'activation"}
              </span>
            ) : (
              <InviteSubcontractorButton subcontractorId={subcontractor.id} hasEmail={Boolean(subcontractor.contactEmail)} />
            )}
          </div>
        </div>

        {subcontractor.courses.length > 0 && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3">Formations assignées</div>
            <div className="flex flex-col gap-1">
              {subcontractor.courses.map((c) => (
                <Link key={c.id} href={`/formations/${c.id}`} className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink w-fit">
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Documents liés ({activeDocuments.length})</div>
          {activeDocuments.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {activeDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3">
                  <a href={doc.fileUrl ?? "#"} target="_blank" rel="noreferrer" className="text-[12px] text-ink underline decoration-line hover:decoration-ink min-w-0 truncate">
                    {CATEGORY_LABELS[doc.category] ?? doc.category} — {doc.title}
                  </a>
                  <DocumentActions documentId={doc.id} archived={false} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-slate">Aucun document.</div>
          )}
          <AddSubcontractorDocumentForm subcontractorId={subcontractor.id} />

          {archivedDocuments.length > 0 && (
            <div className="pt-2 mt-1 border-t border-line flex flex-col gap-1.5">
              <div className="text-[11px] text-slate uppercase tracking-wide">
                Documents archivés ({archivedDocuments.length}) — conservés pour les audits Qualiopi
              </div>
              {archivedDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3">
                  <a href={doc.fileUrl ?? "#"} target="_blank" rel="noreferrer" className="text-[12px] text-slate underline decoration-line hover:decoration-ink min-w-0 truncate">
                    {CATEGORY_LABELS[doc.category] ?? doc.category} — {doc.title}
                  </a>
                  <DocumentActions documentId={doc.id} archived={true} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
