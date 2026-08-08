import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, PhoneLink } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { templateCourseFilter } from "@/lib/templateScope";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format, differenceInCalendarDays, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { EditSubcontractorForm } from "@/components/EditSubcontractorForm";
import { SubcontractorStatusSelect } from "@/components/SubcontractorStatusSelect";
import { AddSubcontractorDocumentForm } from "@/components/AddSubcontractorDocumentForm";
import { InviteSubcontractorButton } from "@/components/InviteSubcontractorButton";
import { DeleteSubcontractorButton } from "@/components/DeleteSubcontractorButton";
import { DocumentActions } from "@/components/DocumentActions";
import { SendSubcontractorDocumentDialog } from "@/components/SendSubcontractorDocumentDialog";
import { SubcontractorDocumentChecklist } from "@/components/SubcontractorDocumentChecklist";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { isYousignConfigured } from "@/lib/yousign";
import { chargerExigences, exigencesDuType, construireChecklist } from "@/lib/subcontractorRequirements";

const SUBCONTRACTOR_TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};

/** yyyy-MM-dd, le seul format qu'accepte <input type="date">. */
function pourChampDate(date: Date | null): string | null {
  return date ? format(date, "yyyy-MM-dd") : null;
}

// Deux routes pour deux natures de document, comme partout ailleurs : un
// fichier téléversé se sert par /file, un document rédigé dans
// l'application (le questionnaire de compétence, qui n'a que du bodyText)
// par /generated. Pointer tout vers /file renvoyait un 404 sur le second.
function lienDocument(doc: { id: string; fileUrl: string | null }): string {
  return doc.fileUrl ? `/api/documents/${doc.id}/file` : `/api/documents/generated/${doc.id}`;
}

export default async function SubcontractorRecordPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireSessionContext();
  // `session.roles` : la forme qui tient compte des rôles cumulés, comme
  // sur /team dont cette page est une sous-page.
  if (can(session.roles, "team") !== "full") redirect("/dashboard");

  const subcontractor = await prisma.subcontractor.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      linkedUser: { select: { id: true, name: true, status: true } },
      courses: { orderBy: { title: "asc" } },
    },
  });
  if (!subcontractor) notFound();

  const [sender, templates, eSignatureAvailable, exigences] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { emailSignature: true } }),
    prisma.documentTemplate.findMany({
      // Un sous-traitant n'est rattaché à aucune formation : pas de modèle
      // de formation ici — voir lib/templateScope.ts.
      where: {
        OR: [{ organizationId: session.organizationId }, { organizationId: null }],
        ...templateCourseFilter(null),
      },
      select: { id: true, title: true, category: true, organizationId: true, forkedFromId: true },
      orderBy: { title: "asc" },
    }),
    isYousignConfigured(session.organizationId),
    chargerExigences(session.organizationId),
  ]);

  const activeDocuments = subcontractor.documents.filter((d) => !d.archivedAt);
  const archivedDocuments = subcontractor.documents.filter((d) => d.archivedAt);

  // La checklist se recalcule ici, à chaque affichage, à partir des mêmes
  // documents que la liste voisine — donc supprimer une pièce la décoche,
  // ce qu'un état stocké n'aurait jamais fait.
  const checklist = construireChecklist(
    exigencesDuType(exigences, subcontractor.type),
    subcontractor.documents,
  );

  // La date limite de dénonciation : c'est elle qui engage, pas la fin de
  // contrat. Affichée sur la fiche pour la même raison qu'elle déclenche
  // une tâche — voir la famille subcontractor_renewal_notice dans
  // lib/dashboardTasks.ts, qui applique exactement le même calcul.
  const dateDenonciation =
    subcontractor.tacitRenewal && subcontractor.contractEndDate && subcontractor.renewalNoticeDays != null
      ? subDays(subcontractor.contractEndDate, subcontractor.renewalNoticeDays)
      : null;
  const joursAvantDenonciation = dateDenonciation ? differenceInCalendarDays(dateDenonciation, new Date()) : null;

  return (
    <>
      <PageHeader title={subcontractor.name} subtitle={SUBCONTRACTOR_TYPE_LABELS[subcontractor.type] ?? subcontractor.type} />
      <div className="p-8 flex flex-col gap-5 max-w-4xl">
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
                  contractStartDate: pourChampDate(subcontractor.contractStartDate),
                  contractEndDate: pourChampDate(subcontractor.contractEndDate),
                  qualificationExpiryDate: pourChampDate(subcontractor.qualificationExpiryDate),
                  tacitRenewal: subcontractor.tacitRenewal,
                  renewalNoticeDays: subcontractor.renewalNoticeDays,
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
                <div className="text-ink">
                  <PhoneLink phone={subcontractor.contactPhone} />
                </div>
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
            {subcontractor.tacitRenewal && (
              <div className="col-span-2">
                <div className="text-[11px] text-slate uppercase tracking-wide mb-1">Reconduction tacite</div>
                {dateDenonciation ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-ink">
                      Dénonciation avant le {format(dateDenonciation, "d MMM yyyy", { locale: fr })}
                      <span className="text-slate"> (préavis de {subcontractor.renewalNoticeDays} jours)</span>
                    </span>
                    {joursAvantDenonciation !== null &&
                      (joursAvantDenonciation < 0 ? (
                        <Pill tone="danger">Préavis dépassé — contrat reconduit</Pill>
                      ) : joursAvantDenonciation <= 30 ? (
                        <Pill tone="warn">
                          {joursAvantDenonciation === 0 ? "Dernier jour" : `Dans ${joursAvantDenonciation} jours`}
                        </Pill>
                      ) : null)}
                  </div>
                ) : (
                  <div className="text-slate">
                    Renseignez la fin de contrat et le préavis pour être alerté avant la date limite de dénonciation.
                  </div>
                )}
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
              <InviteSubcontractorButton
                subcontractorId={subcontractor.id}
                hasEmail={Boolean(subcontractor.contactEmail)}
                nom={subcontractor.name}
              />
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

        {/* Deux colonnes : ce qui est là à gauche, ce qui est attendu à
            droite. Côte à côte parce que la question quotidienne n'est pas
            « quels documents avons-nous ? » mais « lequel manque-t-il
            encore ? » — et y répondre demandait de comparer une liste à une
            règle qui vivait dans la tête du responsable. */}
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
          <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[13.5px] font-semibold text-ink">Documents liés ({activeDocuments.length})</div>
              {subcontractor.contactEmail ? (
                <SendSubcontractorDocumentDialog
                  subcontractorId={subcontractor.id}
                  templates={templates}
                  signatureHtml={sender.emailSignature ?? ""}
                  eSignatureAvailable={eSignatureAvailable}
                />
              ) : (
                <span className="text-[11px] text-slate">Ajoutez un email de contact pour pouvoir envoyer un document</span>
              )}
            </div>
            {activeDocuments.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {activeDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3">
                    <a
                      href={lienDocument(doc)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-ink underline decoration-line hover:decoration-ink min-w-0 truncate"
                    >
                      {CATEGORY_LABELS[doc.category] ?? doc.category} — {doc.title}
                    </a>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.status === "draft" && <Pill tone="neutral">En attente de réponse</Pill>}
                      <DocumentActions documentId={doc.id} archived={false} title={doc.title} />
                    </div>
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
                    <a
                      href={lienDocument(doc)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-slate underline decoration-line hover:decoration-ink min-w-0 truncate"
                    >
                      {CATEGORY_LABELS[doc.category] ?? doc.category} — {doc.title}
                    </a>
                    <DocumentActions documentId={doc.id} archived={true} title={doc.title} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <SubcontractorDocumentChecklist
            lignes={checklist}
            titre={`Pièces attendues — ${SUBCONTRACTOR_TYPE_LABELS[subcontractor.type] ?? subcontractor.type}`}
            lienReglages="/team?tab=pieces"
          />
        </div>
      </div>
    </>
  );
}
