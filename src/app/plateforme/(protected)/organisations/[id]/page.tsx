import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { Pill, InfoRow, PhoneLink, initialsOf } from "@/components/ui";
import { PlateformeMessagerie } from "@/components/PlateformeMessagerie";
import { OrganizationAccessActions } from "@/components/OrganizationAccessActions";
import { OrganizationCgvControl } from "@/components/OrganizationCgvControl";
import { PlatformEmailComposer } from "@/components/PlatformEmailComposer";
import { PlatformContactNoteForm } from "@/components/PlatformContactNoteForm";
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
      platformContactNotes: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
  });
  if (!organization) notFound();

  const sub = organization.subscription;

  // Frise "Activité" : fusion des deux sources, triée par date — même
  // principe que l'onglet Activité du CRM de chaque OFP (qui fusionne
  // ClientOutreach/EmailMessage/Document/Invoice), transposé ici aux deux
  // seules sources qui existent côté plateforme.
  const activity = [
    ...organization.platformEmailMessages.map((msg) => ({
      id: `email-${msg.id}`,
      at: msg.sentAt ?? msg.scheduledAt ?? msg.createdAt,
      text: msg.sentAt ? `Email envoyé — ${msg.subject}` : `Email programmé — ${msg.subject}`,
      dot: (msg.sentAt ? "sage" : "seal") as "sage" | "seal" | "slate",
    })),
    ...organization.platformContactNotes.map((n) => ({
      id: `note-${n.id}`,
      at: n.occurredAt,
      text: n.note,
      dot: "slate" as "sage" | "seal" | "slate",
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const ACTIVITY_DOT_CLASSES: Record<"sage" | "seal" | "slate", string> = {
    sage: "bg-sage",
    seal: "bg-seal-light",
    slate: "bg-ash",
  };

  // Qualité — dérivée de l'abonnement, pas une saisie séparée : un abonnement
  // "actif" est un client payant, tout le reste (essai/impayé/résilié/aucun)
  // reste un prospect. Cohérent avec le filtre de la liste /plateforme.
  const isClient = sub?.status === "active";

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
            <div className="flex items-center gap-2">
              <div className="text-[18px] font-display text-ink">{organization.name}</div>
              <Pill tone={isClient ? "good" : "neutral"}>{isClient ? "Client" : "Prospect"}</Pill>
            </div>
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
          <div className="text-[13.5px] font-semibold text-ink">Accès</div>
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
            <div className="text-[13.5px] font-semibold text-ink">Abonnement</div>
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
          <div className="text-[13.5px] font-semibold text-ink">Conditions générales de vente</div>
          <OrganizationCgvControl organizationId={organization.id} cgvAcceptedAt={organization.cgvAcceptedAt} />
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Informations renseignées par l&apos;organisme</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="flex flex-col gap-1.5">
              <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold mb-0.5">Facturation Jalon</div>
              <InfoRow label="Téléphone">{organization.billingPhone ? <PhoneLink phone={organization.billingPhone} /> : "—"}</InfoRow>
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
              <InfoRow label="Email">
                {organization.publicContactEmail ? (
                  <a href={`mailto:${organization.publicContactEmail}`} className="underline decoration-line hover:decoration-ink">
                    {organization.publicContactEmail}
                  </a>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow label="Téléphone">
                {organization.publicContactPhone ? <PhoneLink phone={organization.publicContactPhone} /> : "—"}
              </InfoRow>
            </div>
          )}
        </div>

        {/* Le fil de discussion dans Jalon, distinct du composeur d'e-mails
            ci-dessous : ici rien ne part par Brevo, l'admin de l'organisme lit
            dans son application. C'est le canal des questions courantes — un
            e-mail programmé reste ce qu'on utilise pour une relance
            commerciale ou une annonce, qui doit atteindre quelqu'un même s'il
            ne se connecte pas. */}
        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">Discussion avec l&apos;organisme</div>
            <div className="text-[11.5px] text-slate mt-0.5 leading-relaxed">
              Visible par le compte administrateur de l&apos;organisme, dans son espace Abonnement. Aucun e-mail
              n&apos;est envoyé.
            </div>
          </div>
          <PlateformeMessagerie
            endpoint={`/api/plateforme/messages/editeur/${organization.id}`}
            moiCamp="platform"
            titre={organization.name}
            sousTitre={admin?.email ?? "Aucun compte administrateur"}
            initiales={initialsOf(organization.name)}
            placeholder="Votre message à cet organisme… (Entrée pour envoyer)"
            vide="Aucun message. Le premier message ouvre le fil ; il apparaîtra dans l'espace de l'organisme, sans e-mail."
          />
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Activité</div>
          <div className="grid grid-cols-2 gap-4">
            <PlatformEmailComposer organizationId={organization.id} defaultTo={admin?.email ?? ""} />
            <PlatformContactNoteForm organizationId={organization.id} />
          </div>
          <div className="flex flex-col pt-3 border-t border-line">
            {activity.map((e, i) => (
              <div key={e.id} className="flex gap-3 pb-4 relative">
                {i < activity.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" />}
                <span className={`w-[11px] h-[11px] rounded-full mt-0.5 shrink-0 z-10 ${ACTIVITY_DOT_CLASSES[e.dot]}`} />
                <div className="min-w-0">
                  <div className="text-[12.5px] text-ink leading-snug whitespace-pre-wrap">{e.text}</div>
                  <div className="text-[11px] text-slate mt-0.5">{format(e.at, "d MMMM yyyy", { locale: fr })}</div>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <div className="text-[12.5px] text-slate">
                Aucune activité pour l&apos;instant — les emails et les contacts notés apparaîtront ici.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
