import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { Pill, InfoRow } from "@/components/ui";
import { OrganizationAccessActions } from "@/components/OrganizationAccessActions";
import { OrganizationCgvControl } from "@/components/OrganizationCgvControl";
import { PlatformEmailComposer } from "@/components/PlatformEmailComposer";
import { fetchPlanPrices, type PlanKey } from "@/lib/billing";

const PLAN_LABELS: Record<string, string> = { solo: "Solo", team: "Team", growth: "Growth" };
const STATUS_LABELS: Record<string, string> = { trialing: "Essai", active: "Actif", past_due: "Impayé", canceled: "Résilié" };
const STATUS_TONES: Record<string, "neutral" | "warn" | "danger" | "good"> = {
  trialing: "warn",
  active: "good",
  past_due: "danger",
  canceled: "neutral",
};

// Fiche par organisme — le clic depuis /plateforme atterrit ici. Regroupe ce
// que la liste ne montre pas : ce que l'organisme a lui-même renseigné
// (identité de facturation + mentions légales, jamais visibles ailleurs
// pour le propriétaire de la plateforme), le prix réel de son abonnement,
// la date d'acceptation des CGV (saisie ici, à la main), et l'historique
// des communications ponctuelles de Jalon vers cet organisme.
export default async function PlatformAdminOrganizationDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      subscription: true,
      _count: { select: { users: true } },
      platformEmailMessages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!organization) notFound();

  const sub = organization.subscription;
  const planKey = (sub?.plan as PlanKey) ?? "solo";
  const prices = sub ? await fetchPlanPrices() : null;
  const price = prices ? prices[planKey] : null;
  const deadline = sub?.status === "trialing" ? sub.trialEndsAt : sub?.currentPeriodEnd;

  // Destinataire par défaut du composeur : le premier compte ADMIN_OF de
  // l'organisme — modifiable dans le formulaire avant envoi.
  const admin = await prisma.user.findFirst({
    where: { organizationId: id, role: Role.ADMIN_OF },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });

  return (
    <div className="min-h-screen bg-mist">
      <div className="px-8 pt-6 pb-4">
        <Link href="/plateforme" className="text-[12px] text-slate hover:text-ink">
          ← Organismes
        </Link>
        <div className="flex items-center justify-between mt-1.5 gap-4">
          <div>
            <div className="text-[18px] font-display text-ink">{organization.name}</div>
            <div className="text-[12.5px] text-slate mt-0.5">
              {organization._count.users} membre{organization._count.users > 1 ? "s" : ""} · depuis{" "}
              {format(organization.createdAt, "d MMMM yyyy", { locale: fr })}
            </div>
          </div>
          <OrganizationAccessActions
            organizationId={organization.id}
            isWarned={Boolean(organization.accessWarningAt)}
            isSuspended={Boolean(organization.suspendedAt)}
          />
        </div>
      </div>

      <div className="px-8 pb-8 flex flex-col gap-4 max-w-3xl">
        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-2.5">
          <div className="text-[13px] font-semibold text-ink">Accès</div>
          <div className="flex flex-wrap gap-2">
            {organization.suspendedAt && (
              <Pill tone="danger">
                Suspendu {format(organization.suspendedAt, "d MMM yyyy", { locale: fr })}
                {organization.suspendedReason ? ` — ${organization.suspendedReason}` : ""}
              </Pill>
            )}
            {organization.accessWarningAt && (
              <Pill tone="warn">
                Averti {format(organization.accessWarningAt, "d MMM yyyy", { locale: fr })}
                {organization.accessWarningReason ? ` — ${organization.accessWarningReason}` : ""}
              </Pill>
            )}
            {!organization.suspendedAt && !organization.accessWarningAt && <Pill tone="good">Normal</Pill>}
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-ink">Abonnement</div>
            {sub && <Pill tone={STATUS_TONES[sub.status] ?? "neutral"}>{STATUS_LABELS[sub.status] ?? sub.status}</Pill>}
          </div>
          {sub ? (
            <div className="flex flex-col gap-1.5">
              <InfoRow label="Formule">{PLAN_LABELS[sub.plan] ?? sub.plan}</InfoRow>
              <InfoRow label="Prix mensuel">
                {price
                  ? `${(price.amountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: price.currency.toUpperCase() })} HT / mois`
                  : "Non disponible"}
              </InfoRow>
              <InfoRow label={sub.status === "trialing" ? "Fin d'essai" : "Échéance"}>
                {deadline ? format(deadline, "d MMMM yyyy", { locale: fr }) : "—"}
              </InfoRow>
              {sub.cancelAtPeriodEnd && <InfoRow label="Résiliation">programmée en fin de période</InfoRow>}
              {sub.stripeCustomerId && (
                <InfoRow label="Stripe">
                  <a
                    href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-seal hover:underline"
                  >
                    Voir le client →
                  </a>
                </InfoRow>
              )}
            </div>
          ) : (
            <div className="text-[12.5px] text-slate">Aucun abonnement enregistré.</div>
          )}
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-2">
          <div className="text-[13px] font-semibold text-ink">Conditions générales de vente</div>
          <OrganizationCgvControl organizationId={organization.id} cgvAcceptedAt={organization.cgvAcceptedAt} />
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13px] font-semibold text-ink">Informations renseignées par l&apos;organisme</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="flex flex-col gap-1.5">
              <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-0.5">Facturation Jalon</div>
              <InfoRow label="SIRET">{organization.siret ?? "—"}</InfoRow>
              <InfoRow label="Adresse">{organization.billingAddress ?? "—"}</InfoRow>
              <InfoRow label="Code postal">{organization.billingPostalCode ?? "—"}</InfoRow>
              <InfoRow label="Ville">{organization.billingCity ?? "—"}</InfoRow>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-0.5">
                Mentions légales (documents émis par l&apos;OF)
              </div>
              <InfoRow label="Forme juridique">{organization.legalForm ?? "—"}</InfoRow>
              <InfoRow label="Capital social">{organization.shareCapital ?? "—"}</InfoRow>
              <InfoRow label="Siège social">{organization.legalAddress ?? "—"}</InfoRow>
              <InfoRow label="RCS">
                {organization.rcsNumber ? `${organization.rcsNumber} (${organization.rcsCity ?? "—"})` : "—"}
              </InfoRow>
              <InfoRow label="Représentant légal">{organization.legalRepresentativeName ?? "—"}</InfoRow>
              <InfoRow label="N° déclaration d'activité">{organization.activityDeclarationNumber ?? "—"}</InfoRow>
              <InfoRow label="Régime TVA">
                {organization.vatRegime === "standard"
                  ? `Standard${organization.vatRatePercent ? ` (${organization.vatRatePercent}%)` : ""}`
                  : "Exonéré"}
              </InfoRow>
              {organization.vatNumber && <InfoRow label="N° TVA">{organization.vatNumber}</InfoRow>}
            </div>
          </div>
          {(organization.publicContactEmail || organization.publicContactPhone) && (
            <div className="flex flex-col gap-1.5 pt-2.5 border-t border-line">
              <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-0.5">Contact public (catalogue)</div>
              <InfoRow label="Email">{organization.publicContactEmail ?? "—"}</InfoRow>
              <InfoRow label="Téléphone">{organization.publicContactPhone ?? "—"}</InfoRow>
            </div>
          )}
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13px] font-semibold text-ink">Communications</div>
          <PlatformEmailComposer organizationId={organization.id} defaultTo={admin?.email ?? ""} />
          {organization.platformEmailMessages.length > 0 && (
            <div className="flex flex-col gap-2.5 pt-3 border-t border-line">
              {organization.platformEmailMessages.map((msg) => (
                <div key={msg.id} className="text-[12px] flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink">{msg.subject}</span>
                    {msg.sentAt ? (
                      <Pill tone="good">Envoyé le {format(msg.sentAt, "d MMM yyyy", { locale: fr })}</Pill>
                    ) : (
                      <Pill tone="warn">
                        Programmé{msg.scheduledAt ? ` pour le ${format(msg.scheduledAt, "d MMM yyyy", { locale: fr })}` : ""}
                      </Pill>
                    )}
                  </div>
                  <span className="text-slate">à {msg.toEmail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
