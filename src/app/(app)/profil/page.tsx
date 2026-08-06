import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, initialsOf } from "@/components/ui";
import { requireSessionContext, ROLE_LABELS } from "@/lib/tenant";
import { SignatureEditor } from "@/components/SignatureEditor";
import { OrganizationLegalForm } from "@/components/OrganizationLegalForm";
import { OrganizationBrandingForm } from "@/components/OrganizationBrandingForm";
import { InvoiceNumberingForm } from "@/components/InvoiceNumberingForm";
import { OrganizationConsumerForm } from "@/components/OrganizationConsumerForm";
import { chargerEtatMediation } from "@/lib/mediationServeur";
import { messageMediation } from "@/lib/mediationConsommation";
import { Role } from "@prisma/client";
import { CollapsibleSection } from "@/components/CollapsibleSection";

// Every role gets one — no permission gate beyond being logged in, unlike
// most pages here which are feature-gated per PERMISSIONS.
//
// Two columns, two owners: the left is about the PERSON (identity,
// their mail signature), the right about the ORGANISATION (brand, legal
// mentions) and only exists for ADMIN_OF. The prior single stack made
// "your signature" and "your company's RCS number" read as the same kind
// of thing, which they are not.
export default async function ProfilePage() {
  const session = await requireSessionContext();
  const [user, organization] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    session.role === Role.ADMIN_OF
      ? prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } })
      : null,
  ]);
  // Ce que la situation réelle impose de dire sur la médiation : une
  // information pour un organisme qui ne vend qu'aux entreprises, un
  // manquement dès qu'il y a un particulier. Voir mediationConsommation.ts.
  const etatMediation = organization
    ? await chargerEtatMediation(session.organizationId)
    : { mediateurRenseigne: false, signal: { contratsParticulier: 0, facturesFondsPropres: 0 }, reporteJusquA: null };

  // L'état de chaque bloc, affiché sous son titre et lisible sans déplier.
  //
  // La page présentait quatre cartes dépliées de poids identique : rien n'y
  // disait où il manquait quelque chose, alors qu'un SIRET absent produit
  // silencieusement un contrat troué. Ce qui est complet se replie, ce qui
  // manque s'ouvre — la page s'ouvre donc sur ce qui reste à faire.
  const manqueLegal = organization
    ? [
        !organization.siret?.trim() && "SIRET",
        !organization.legalAddress?.trim() && "adresse du siège",
        !organization.legalRepresentativeName?.trim() && "représentant légal",
        !organization.activityDeclarationNumber?.trim() && "n° de déclaration d'activité",
      ].filter((x): x is string => typeof x === "string")
    : [];
  const marqueFaite = Boolean(organization?.logoUrl);
  // Le médiateur n'est un manquement que face à un signal B2C réel : un
  // organisme qui ne vend qu'aux entreprises n'y est pas tenu.
  const vendAuxParticuliers =
    etatMediation.signal.contratsParticulier > 0 || etatMediation.signal.facturesFondsPropres > 0;
  const mediateurManquant = vendAuxParticuliers && !etatMediation.mediateurRenseigne;

  const etat = (texte: string, alerte = false) => (
    <span className={`text-[11.5px] ${alerte ? "text-rust" : "text-slate"}`}>{texte}</span>
  );
  const titre = (t: string) => <span className="text-[13.5px] font-semibold text-ink">{t}</span>;
  const prochaineAutomatique = `FAC-${new Date().getFullYear()}-001`;

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Vos informations personnelles et les réglages de votre organisme" />
      <div className={`p-8 grid grid-cols-1 gap-6 items-start ${organization ? "max-w-5xl lg:grid-cols-2" : "max-w-2xl"}`}>
        <div className="flex flex-col gap-4">
          {/* Deux domaines, deux propriétaires : ce qui est à vous, ce qui
              est à l'organisme. Le client proposait deux sous-onglets ; la
              page tenant desormais en cinq lignes repliées, des onglets
              coûteraient un clic pour naviguer dans ce qui tient sur un
              écran, et surtout ils cacheraient la ligne « à compléter » —
              qui est tout l'intérêt du repli — depuis l'autre onglet. Un
              intertitre franc donne la même frontière sans ce prix. Les
              libellés sont les siens. */}
          <div className="text-[12px] font-semibold text-ink border-b border-line pb-1.5">Moi</div>

          <div className="bg-white border border-line rounded-card p-5 flex items-center gap-4">
            <Avatar initials={initialsOf(user.name)} size="lg" />
            <div className="min-w-0">
              <div className="font-display text-[16px] text-ink">{user.name}</div>
              <div className="text-[12.5px] text-slate mt-0.5">{user.email}</div>
              <div className="mt-1.5">
                <Pill tone="neutral">{ROLE_LABELS[user.role]}</Pill>
              </div>
            </div>
          </div>

          {/* Repliée comme les blocs de l'organisme, et pour la même raison :
              une signature se règle une fois. Dépliée, son éditeur faisait à
              lui seul la hauteur des quatre cartes de droite réunies — replier
              celles-ci sans celle-ci n'aurait fait que déplacer le
              déséquilibre d'une colonne à l'autre. */}
          <CollapsibleSection
            title={titre("Signature de mail")}
            defaultOpen={!user.emailSignature}
            header={etat(
              user.emailSignature
                ? "Signature personnalisée, ajoutée à vos messages."
                : `Signature par défaut : « Cordialement, ${user.name} ».`,
            )}
          >
            <div className="text-[11.5px] text-slate mb-3">
              Ajoutée automatiquement à la fin des messages composés (envoi de documents, communications avec un
              apprenant ou un prospect) — la même que celle que vous utilisez normalement depuis votre propre boîte
              mail.
            </div>
            <SignatureEditor initialSignature={user.emailSignature ?? `Cordialement,<br>${user.name}`} />
          </CollapsibleSection>
        </div>

        {organization && (
          <div className="flex flex-col gap-4">
            <div className="text-[12px] font-semibold text-ink border-b border-line pb-1.5">Mon organisme</div>

            <CollapsibleSection
              title={titre("Marque")}
              defaultOpen={!marqueFaite}
              header={etat(
                marqueFaite
                  ? "Logo en place — vos apprenants ne voient pas Jalon."
                  : "Aucun logo : vos pages publiques portent encore la marque Jalon.",
              )}
            >
              <div className="text-[11.5px] text-slate mb-3">
                Logo et couleur affichés à la place de ceux de Jalon dans l&apos;espace de vos apprenants et sur les
                pages publiques qu&apos;ils reçoivent (recueil des besoins, évaluations, activation de compte) — vos
                apprenants n&apos;ont pas besoin de savoir que vous utilisez Jalon.
              </div>
              <OrganizationBrandingForm
                initial={{
                  logoUrl: organization.logoUrl,
                  brandColor: organization.brandColor,
                  publicContactEmail: organization.publicContactEmail,
                  publicContactPhone: organization.publicContactPhone,
                }}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title={titre("Informations légales de l'organisme")}
              defaultOpen={manqueLegal.length > 0}
              header={etat(
                manqueLegal.length === 0
                  ? "Complètes — vos contrats et conventions se remplissent seuls."
                  : `À compléter : ${manqueLegal.join(", ")}. Un contrat généré porterait le trou.`,
                manqueLegal.length > 0,
              )}
            >
              <div className="text-[11.5px] text-slate mb-3">
                Mentions légales à faire figurer sur vos documents (contrats, conventions, CGV) — reprises
                automatiquement dans les documents générés depuis la bibliothèque de modèles.
              </div>
              <OrganizationLegalForm
                initial={{
                  siret: organization.siret ?? "",
                  legalForm: organization.legalForm ?? "",
                  shareCapital: organization.shareCapital ?? "",
                  legalAddress: organization.legalAddress ?? "",
                  rcsCity: organization.rcsCity ?? "",
                  rcsNumber: organization.rcsNumber ?? "",
                  legalRepresentativeName: organization.legalRepresentativeName ?? "",
                  activityDeclarationNumber: organization.activityDeclarationNumber ?? "",
                  vatRegime: organization.vatRegime,
                  vatRatePercent: organization.vatRatePercent?.toString() ?? "20",
                  vatNumber: organization.vatNumber ?? "",
                }}
              />
            </CollapsibleSection>

            {/* Les mentions et réglages qui ne concernent QUE la vente au
                particulier. Ils vivaient dans un onglet « Réglages des
                contrats » de la bibliothèque de modèles, mélangés à une
                clause négociée qui n'avait rien à y faire — et le médiateur,
                qui est une mention d'identité, n'existait nulle part
                ailleurs. */}
            <div id="particuliers" className="scroll-mt-4">
              <CollapsibleSection
                title={titre("Vente aux particuliers")}
                defaultOpen={mediateurManquant}
                header={etat(
                  mediateurManquant
                    ? "Médiateur manquant alors que vous vendez à des particuliers — obligatoire (art. L.612-1)."
                    : etatMediation.mediateurRenseigne
                      ? "Médiateur renseigné — la mention part dans vos contrats."
                      : "Sans objet tant que vous ne vendez qu'à des entreprises et à des financeurs.",
                  mediateurManquant,
                )}
              >
                <div className="text-[11.5px] text-slate mb-3">
                  Ce qui s&apos;applique quand votre client est une personne physique qui finance sa formation
                  elle-même.
                </div>
                <OrganizationConsumerForm
                initial={{
                  regionPrefecture: organization.regionPrefecture ?? "",
                  mediatorName: organization.mediatorName ?? "",
                  mediatorContact: organization.mediatorContact ?? "",
                  withdrawalAccessPolicy: organization.withdrawalAccessPolicy,
                  cancellationFeePercent: organization.cancellationFeePercent,
                }}
                messageMediation={messageMediation(etatMediation)}
                  rappelReporte={
                    etatMediation.reporteJusquA !== null && etatMediation.reporteJusquA > new Date()
                  }
                />
              </CollapsibleSection>
            </div>

            <div id="numerotation" className="scroll-mt-4">
              <CollapsibleSection
                title={titre("Numérotation des factures")}
                header={etat(
                  // Les deux champs sont nullables ET null signifie
                  // « laisse Jalon numéroter » — il faut donc les traiter
                  // ensemble : un préfixe sans compteur ne décrit aucune
                  // séquence, et afficher la valeur brute donnerait
                  // « nullnull ».
                  organization.invoicePrefix && organization.invoiceNextNumber
                    ? `Prochaine facture : ${organization.invoicePrefix}${String(organization.invoiceNextNumber).padStart(3, "0")}.`
                    : `Numérotation automatique — prochaine facture : ${prochaineAutomatique}.`,
                )}
              >
                <div className="text-[11.5px] text-slate mb-3">
                  Vos factures doivent porter des numéros qui se suivent, sans trou et sans doublon, toutes sources
                  confondues. Si vous en émettez déjà depuis un autre outil, reprenez ici votre propre séquence pour
                  qu&apos;elle reste continue.
                </div>
                <InvoiceNumberingForm
                  initialPrefix={organization.invoicePrefix}
                  initialNextNumber={organization.invoiceNextNumber}
                  exempleAutomatique={prochaineAutomatique}
                />
              </CollapsibleSection>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
