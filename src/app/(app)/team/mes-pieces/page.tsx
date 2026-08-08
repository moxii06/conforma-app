import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, EmptyState } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AddSubcontractorDocumentForm } from "@/components/AddSubcontractorDocumentForm";
import { SubcontractorDocumentChecklist } from "@/components/SubcontractorDocumentChecklist";
import { SubcontractorQuestionnaireForm } from "@/components/SubcontractorQuestionnaireForm";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { chargerExigences, exigencesDuType, construireChecklist } from "@/lib/subcontractorRequirements";
import { QUESTIONNAIRE_CATEGORIE } from "@/lib/subcontractorQuestionnaire";

// L'espace de l'intervenant : ce que son organisme attend de lui, et de
// quoi le déposer.
//
// L'ACCÈS NE PASSE PAS PAR LE RÔLE. Un sous-traitant invité reçoit un
// compte TRAINER ordinaire (voir /api/subcontractors/[id]/invite), et
// « team » est fermé à ce rôle — à raison : il n'a rien à faire dans
// l'annuaire du personnel ni dans la matrice des permissions. Ce qui ouvre
// cette page-ci n'est donc pas une casquette mais un RATTACHEMENT :
// exister comme Subcontractor.linkedUserId de l'organisation en cours,
// relu en base. Un formateur interne, un commercial ou un admin qui
// n'auraient pas ce lien tombent sur la redirection.
export default async function MesPiecesPage() {
  const session = await requireSessionContext();

  const subcontractor = await prisma.subcontractor.findFirst({
    where: { organizationId: session.organizationId, linkedUserId: session.userId },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  if (!subcontractor) redirect("/dashboard");

  const exigences = await chargerExigences(session.organizationId);
  const checklist = construireChecklist(exigencesDuType(exigences, subcontractor.type), subcontractor.documents);

  const documentsActifs = subcontractor.documents.filter((d) => !d.archivedAt);
  const ligneQuestionnaire = checklist.find((l) => l.documentCategory === QUESTIONNAIRE_CATEGORIE);
  const questionnaireRepondu = ligneQuestionnaire?.fourni ?? null;

  return (
    <>
      <PageHeader
        title="Mes pièces justificatives"
        subtitle="Les documents attendus par votre organisme, et le questionnaire de compétence"
      />
      <div className="p-8 flex flex-col gap-5 max-w-4xl">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
          <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
            <div className="text-[13.5px] font-semibold text-ink">Déposer une pièce</div>
            <div className="text-[11.5px] text-slate">
              Choisissez la nature du document, donnez-lui un titre, puis joignez le fichier. Il arrive directement
              dans votre dossier chez votre organisme.
            </div>
            <AddSubcontractorDocumentForm subcontractorId={subcontractor.id} />

            <div className="pt-3 mt-1 border-t border-line">
              <div className="text-[12.5px] font-semibold text-ink mb-2">
                Pièces déjà déposées ({documentsActifs.length})
              </div>
              {documentsActifs.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {documentsActifs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3">
                      {/* Pas de lien de téléchargement ici : la lecture d'un
                          document de prestataire est réservée à l'équipe de
                          l'organisme (lib/documentAccess.ts). Afficher un lien
                          qui répondrait 403 serait pire que pas de lien. */}
                      <span className="text-[12px] text-ink min-w-0 truncate">
                        {CATEGORY_LABELS[doc.category] ?? doc.category} — {doc.title}
                      </span>
                      <span className="text-[11px] text-slate shrink-0">
                        {doc.status === "draft" ? (
                          <Pill tone="neutral">À renseigner</Pill>
                        ) : (
                          format(doc.createdAt, "d MMM yyyy", { locale: fr })
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-slate">Aucune pièce déposée pour l&apos;instant.</div>
              )}
            </div>
          </div>

          <SubcontractorDocumentChecklist lignes={checklist} titre="Ce qui est attendu de vous" />
        </div>

        {ligneQuestionnaire &&
          (questionnaireRepondu ? (
            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-1">Questionnaire de compétence</div>
              <div className="text-[12px] text-slate">
                Renseigné le {format(questionnaireRepondu.createdAt, "d MMMM yyyy", { locale: fr })}. Pour le
                corriger, contactez votre organisme.
              </div>
            </div>
          ) : (
            <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
              <div>
                <div className="text-[13.5px] font-semibold text-ink mb-1">Questionnaire de compétence</div>
                <div className="text-[11.5px] text-slate">
                  Votre organisme doit pouvoir justifier des compétences de chaque intervenant. Vos réponses sont
                  versées à votre dossier — répondez avec vos mots, il n&apos;y a pas de bonne réponse attendue.
                </div>
              </div>
              <SubcontractorQuestionnaireForm subcontractorId={subcontractor.id} />
            </div>
          ))}

        {checklist.length === 0 && documentsActifs.length === 0 && (
          <EmptyState
            title="Rien n'est attendu de vous pour le moment"
            description="Votre organisme n'a défini aucune pièce justificative pour votre type d'intervention. Vous pouvez malgré tout déposer un document ci-dessus s'il vous en a demandé un."
          />
        )}
      </div>
    </>
  );
}
