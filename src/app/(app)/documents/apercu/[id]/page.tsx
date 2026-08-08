import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSessionContext } from "@/lib/tenant";
import { INCLUDE_ACCES_DOCUMENT, peutLireDocument } from "@/lib/documentAccess";
import { ensureHtml } from "@/lib/plainTextToHtml";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { aUnEnTete, lignesEnTete, mentionPiedDePage, type IdentiteOrganisme } from "@/lib/documentLayout";
import { Button } from "@/components/ui";

// La consultation d'un document.
//
// Cette page n'existait pas : un clic sur un document dans la liste menait
// droit à /api/documents/generated/<id>, une URL d'API qui rendait le corps
// en text/plain. Depuis que les documents sont du HTML, on y voyait donc le
// CODE SOURCE — une page de balises, sans titre, sans retour, sans contexte.
//
// Ce qui est montré ici est exactement ce que contiendra le PDF : même
// habillage (en-tête, mentions légales), même mise en page (document-prose).
// Une prévisualisation qui ne ressemble pas au fichier ne prouve rien.
export default async function ApercuDocumentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requireSessionContext();

  const document = await prisma.document.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      ...INCLUDE_ACCES_DOCUMENT,
      dossier: {
        select: {
          id: true,
          learnerUserId: true,
          contact: { select: { firstName: true, lastName: true } },
          session: { select: { trainerId: true, course: { select: { title: true } } } },
        },
      },
      contact: { select: { id: true, firstName: true, lastName: true } },
      subcontractor: { select: { id: true, name: true } },
    },
  });
  if (!document) notFound();
  // `role` ET `roles` : le premier porte les règles de propriété, le second
  // les `can()`. Voir le commentaire de LecteurDocument. L'aperçu et les deux
  // routes qui servent les octets doivent poser exactement la même question.
  if (!peutLireDocument(document, { role: session.role, roles: session.roles, userId: session.userId })) notFound();

  // Un document téléversé n'a pas de corps à afficher : on renvoie vers ses
  // octets plutôt que d'afficher une page vide.
  if (!document.bodyText && document.fileUrl) redirect(`/api/documents/${document.id}/file`);

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: {
      name: true,
      logoUrl: true,
      legalForm: true,
      legalAddress: true,
      siret: true,
      activityDeclarationNumber: true,
      regionPrefecture: true,
      publicContactPhone: true,
      publicContactEmail: true,
    },
  });

  const identite: IdentiteOrganisme = {
    nom: org?.name ?? "",
    logoUrl: org?.logoUrl ?? null,
    formeJuridique: org?.legalForm ?? null,
    adresseLegale: org?.legalAddress ?? null,
    siret: org?.siret ?? null,
    numeroDeclarationActivite: org?.activityDeclarationNumber ?? null,
    prefectureRegion: org?.regionPrefecture ?? null,
    telephone: org?.publicContactPhone ?? null,
    email: org?.publicContactEmail ?? null,
  };

  const destinataire = document.dossier
    ? `${document.dossier.contact.firstName} ${document.dossier.contact.lastName}`
    : document.contact
      ? `${document.contact.firstName} ${document.contact.lastName}`
      : (document.subcontractor?.name ?? null);
  const formation = document.dossier?.session.course.title ?? null;

  const ETATS: Record<string, { texte: string; classe: string }> = {
    draft: { texte: "Brouillon", classe: "bg-pebble text-slate" },
    final: { texte: "Finalisé — pas encore envoyé", classe: "bg-[#EDDFC6] text-seal-dark" },
    sent: { texte: "Envoyé", classe: "bg-[#DEE5E0] text-sage" },
    signed: { texte: "Signé", classe: "bg-[#DEE5E0] text-sage" },
  };
  const etat = ETATS[document.status] ?? ETATS.final;
  const mention = mentionPiedDePage(identite);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link href="/documents" className="text-[12.5px] text-slate hover:text-ink">
            ← Retour aux documents
          </Link>
          <h1 className="font-display text-[22px] text-ink mt-1">{document.title}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${etat.classe}`}>{etat.texte}</span>
            {document.category && CATEGORY_LABELS[document.category] && (
              <span className="text-[11.5px] text-slate">{CATEGORY_LABELS[document.category]}</span>
            )}
            {[destinataire, formation].filter(Boolean).length > 0 && (
              <span className="text-[12.5px] text-slate">{[destinataire, formation].filter(Boolean).join(" — ")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {document.dossier && (
            <Link href={`/dossiers/${document.dossier.id}`} className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink">
              Voir le dossier
            </Link>
          )}
          {/* Le PDF vient de la même route que la pièce jointe envoyée : ce
              qu'on télécharge ici est, aux octets près, ce que le client a
              reçu. */}
          <Button href={`/api/documents/generated/${document.id}`} size="sm">
            Télécharger en PDF
          </Button>
        </div>
      </div>

      {/* La feuille. Même habillage que le fichier : logo et identité en
          haut, mentions légales en bas. */}
      <div className="bg-white border border-line rounded-card px-9 py-8">
        {aUnEnTete(identite) && (
          <div className="flex items-start justify-between gap-6 pb-4 mb-6 border-b border-line">
            {identite.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identite.logoUrl} alt={identite.nom} className="max-h-[38px] w-auto shrink-0" />
            ) : (
              <span />
            )}
            <div className="text-right min-w-0">
              {lignesEnTete(identite).map((ligne, i) => (
                <div key={ligne} className={i === 0 ? "text-[12.5px] font-semibold text-ink" : "text-[11px] text-slate"}>
                  {ligne}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border border-ink rounded-sm px-5 py-3.5 mb-7 text-center">
          <div className="text-[14px] font-semibold text-ink uppercase tracking-wide">{document.title}</div>
        </div>

        {/* Le corps vient de nos propres modèles et de l'éditeur, tous deux
            passés par sanitizeRichText à l'enregistrement. Aucune source
            tierce n'alimente ce champ. */}
        <div className="document-prose mx-auto" dangerouslySetInnerHTML={{ __html: ensureHtml(document.bodyText ?? "") }} />

        {mention && (
          <div className="border-t border-line mt-8 pt-3 text-[10.5px] text-slate leading-snug">{mention}</div>
        )}
      </div>
    </div>
  );
}
