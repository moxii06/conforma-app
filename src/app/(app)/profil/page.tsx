import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, initialsOf } from "@/components/ui";
import { requireSessionContext, ROLE_LABELS } from "@/lib/tenant";
import { SignatureEditor } from "@/components/SignatureEditor";
import { OrganizationLegalForm } from "@/components/OrganizationLegalForm";
import { OrganizationBrandingForm } from "@/components/OrganizationBrandingForm";
import { Role } from "@prisma/client";

// Every role gets one — no permission gate beyond being logged in, unlike
// most pages here which are feature-gated per PERMISSIONS.
//
// Two columns, two owners: the left is about the PERSON (identity,
// their mail signature), the right about the ORGANISATION (brand, legal
// mentions) and only exists for ADMIN_OF. The prior single stack made
// "your signature" and "your company's RCS number" read as the same kind
// of thing, which they are not. Contract-wide clause settings moved to the
// Bibliothèque's "Réglages des contrats" tab, next to the templates they
// feed.
export default async function ProfilePage() {
  const session = await requireSessionContext();
  const [user, organization] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    session.role === Role.ADMIN_OF
      ? prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } })
      : null,
  ]);

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Vos informations personnelles et les réglages de votre organisme" />
      <div className={`p-8 grid grid-cols-1 gap-6 items-start ${organization ? "max-w-5xl lg:grid-cols-2" : "max-w-2xl"}`}>
        <div className="flex flex-col gap-4">
          <div className="text-[11px] font-semibold text-slate uppercase tracking-wide">Vous</div>

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

          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-1">Signature de mail</div>
            <div className="text-[11.5px] text-slate mb-3">
              Ajoutée automatiquement à la fin des messages composés (envoi de documents, communications avec un
              apprenant ou un prospect) — la même que celle que vous utilisez normalement depuis votre propre boîte
              mail.
            </div>
            <SignatureEditor initialSignature={user.emailSignature ?? `Cordialement,<br>${user.name}`} />
          </div>
        </div>

        {organization && (
          <div className="flex flex-col gap-4">
            <div className="text-[11px] font-semibold text-slate uppercase tracking-wide">Votre organisme</div>

            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-1">Marque</div>
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
            </div>

            <div className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-1">Informations légales de l&apos;organisme</div>
              <div className="text-[11.5px] text-slate mb-3">
                Mentions légales à faire figurer sur vos documents (contrats, conventions, CGV) — reprises
                automatiquement dans les documents générés depuis la bibliothèque de modèles. Les clauses des
                contrats (rétractation, indemnités, médiation) se règlent dans la{" "}
                <a href="/documents?tab=reglages" className="underline decoration-line hover:decoration-ink text-ink">
                  Bibliothèque de documents
                </a>
                .
              </div>
              <OrganizationLegalForm
                initial={{
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
            </div>
          </div>
        )}
      </div>
    </>
  );
}
