import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, InfoRow, initialsOf } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { getSignatureQuota, OVERAGE_PRICE_CENTS } from "@/lib/signatureQuota";
import { SubscriptionActions, type InfoResiliation } from "@/components/SubscriptionActions";
import { billingConfigured, fetchPlanPrices } from "@/lib/billing";
import { PlateformeMessagerie } from "@/components/PlateformeMessagerie";
import { NOM_EDITEUR } from "@/lib/messageriePlateforme";
import { formaterMontant, libelleFormule } from "@/lib/tarifs";

const STATUS_LABELS: Record<string, { label: string; tone: "good" | "warn" | "danger" | "neutral" }> = {
  trialing: { label: "Période d'essai", tone: "warn" },
  active: { label: "Actif", tone: "good" },
  past_due: { label: "Paiement en retard", tone: "danger" },
  canceled: { label: "Résilié", tone: "neutral" },
};

/** L'ancre du fil éditeur, visée par les boutons « écrire à l'équipe ». */
const ANCRE_MESSAGERIE = "echanges-editeur";

// Billing is the ADMIN_OF's concern per spec §2 — same gate as /integrations.
// Expressed through the PERMISSIONS matrix rather than a bare role test, so
// the sidebar entry and this redirect can't drift apart (see the "billing"
// key's comment in tenant.ts).
export default async function AbonnementPage(props: {
  searchParams: Promise<{ souscription?: string }>;
}) {
  const { organizationId, roles } = await requireSessionContext();
  if (can(roles, "billing") !== "full") redirect("/dashboard");
  const searchParams = await props.searchParams;

  // organizationId vient de la session, jamais de l'URL : Subscription est
  // unique par organisme, donc cette lecture est le filtre de tenant.
  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
  const status = subscription
    ? (STATUS_LABELS[subscription.status] ?? { label: subscription.status, tone: "neutral" as const })
    : null;
  const signatureQuota = await getSignatureQuota(organizationId);
  const prices = await fetchPlanPrices();

  // Négatif quand l'essai est déjà passé : un essai expiré ne doit pas
  // s'annoncer comme se terminant aujourd'hui.
  const daysLeft =
    subscription?.status === "trialing" && subscription.trialEndsAt
      ? differenceInCalendarDays(subscription.trialEndsAt, new Date())
      : null;

  // La date d'effet d'une résiliation est calculée ICI, côté serveur, et
  // passée déjà formatée : c'est la même date que celle affichée dans la carte
  // « formule actuelle », et deux calculs séparés finiraient par diverger d'un
  // jour selon le fuseau du navigateur.
  const termeEffet = subscription?.currentPeriodEnd ?? subscription?.trialEndsAt ?? null;
  const resiliation: InfoResiliation = {
    dateEffet: subscription?.currentPeriodEnd
      ? format(subscription.currentPeriodEnd, "d MMMM yyyy", { locale: fr })
      : subscription?.status === "trialing" && subscription.trialEndsAt
        ? format(subscription.trialEndsAt, "d MMMM yyyy", { locale: fr })
        : null,
    nature: subscription?.currentPeriodEnd
      ? "periode"
      : subscription?.status === "trialing" && subscription.trialEndsAt
        ? "essai"
        : null,
    // Un terme déjà passé (essai échu, période non renouvelée) ne peut pas être
    // présenté comme une échéance à venir : la résiliation y serait immédiate.
    echue: termeEffet ? termeEffet.getTime() < Date.now() : false,
    dejaDemandee: subscription?.cancelAtPeriodEnd ?? false,
  };

  return (
    <>
      <PageHeader
        title="Abonnement"
        subtitle="Votre abonnement Jalon — formules, factures et relation avec l'éditeur"
      />
      <div className="p-8 flex flex-col gap-5 max-w-5xl">
        {/* Retour de Stripe après un passage en caisse. Le webhook fait foi
            sur l'activation ; ce bandeau ne fait qu'accuser réception du
            parcours, sans affirmer que le paiement a abouti. */}
        {searchParams.souscription === "ok" && (
          <div className="bg-[#DEE5E0] text-sage text-[12.5px] rounded-md px-3.5 py-2.5">
            Paiement transmis. L&apos;activation de votre formule se fait à la confirmation de Stripe, en général
            en quelques secondes — actualisez la page si la formule affichée ci-dessous n&apos;a pas encore changé.
          </div>
        )}
        {searchParams.souscription === "annulee" && (
          <div className="bg-linen text-slate text-[12.5px] rounded-md px-3.5 py-2.5">
            Souscription abandonnée : rien n&apos;a été facturé et votre formule est inchangée.
          </div>
        )}

        {/* ---- Formule actuelle ---- */}
        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13.5px] font-semibold text-ink">Formule actuelle</div>
            {status && <Pill tone={status.tone}>{status.label}</Pill>}
          </div>
          {subscription ? (
            <>
              <div className="text-2xl font-display text-ink">{libelleFormule(subscription.plan)}</div>
              {daysLeft !== null && (
                <div className="text-[12.5px] text-slate">
                  {daysLeft > 0
                    ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""} avant la fin de l'essai, sans carte bancaire enregistrée.`
                    : daysLeft === 0
                      ? "L'essai se termine aujourd'hui."
                      : `Période d'essai échue depuis le ${resiliation.dateEffet ?? "terme prévu"} — choisissez une formule ci-dessous pour la poursuivre.`}
                </div>
              )}
              <div className="border-t border-line pt-3 flex flex-col gap-0.5">
                {subscription.currentPeriodEnd && (
                  <InfoRow label={subscription.cancelAtPeriodEnd ? "Fin d'accès" : "Prochaine échéance"}>
                    {format(subscription.currentPeriodEnd, "d MMMM yyyy", { locale: fr })}
                  </InfoRow>
                )}
                {subscription.cancelAtPeriodEnd && (
                  <InfoRow label="Résiliation">Enregistrée — aucun renouvellement</InfoRow>
                )}
                <InfoRow label="Organisme créé le">
                  {format(subscription.createdAt, "d MMMM yyyy", { locale: fr })}
                </InfoRow>
              </div>
            </>
          ) : (
            <div className="text-[12.5px] text-slate">
              Aucun abonnement enregistré pour cet organisme. Choisissez une formule ci-dessous ou écrivez à
              l&apos;éditeur en bas de page.
            </div>
          )}
        </div>

        {/* ---- Quota de signatures (formule Solo uniquement) ---- */}
        {signatureQuota.metered && (
          <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13.5px] font-semibold text-ink">Signatures électroniques</div>
              <Pill tone={signatureQuota.overage > 0 ? "warn" : "neutral"}>
                {Math.min(signatureQuota.used, signatureQuota.included)} / {signatureQuota.included} incluses ce
                mois-ci
              </Pill>
            </div>
            <div className="text-[12.5px] text-slate leading-relaxed">
              L&apos;offre Solo inclut {signatureQuota.included} demandes de signature électronique par mois via le
              compte Yousign de Jalon ; au-delà, chaque signature est refacturée{" "}
              {formaterMontant(OVERAGE_PRICE_CENTS)}{" "}HT sur votre facture mensuelle. Les signatures envoyées via
              votre propre clé Yousign (page Intégrations) ne sont pas comptées. Les formules Team et Growth n&apos;ont
              pas de compteur.
            </div>
            {signatureQuota.overage > 0 && (
              <div className="text-[12.5px] text-rust">
                {signatureQuota.overage} signature{signatureQuota.overage > 1 ? "s" : ""} hors forfait ce mois-ci —{" "}
                {formaterMontant(signatureQuota.overage * OVERAGE_PRICE_CENTS)} HT seront refacturés.
              </div>
            )}
          </div>
        )}

        {/* Comparatif, changement de formule, factures, contact, résiliation. */}
        <SubscriptionActions
          formuleActuelle={subscription?.plan ?? null}
          statut={subscription?.status ?? null}
          abonnementPayant={Boolean(subscription?.stripeCustomerId)}
          souscriptionEnLigne={billingConfigured()}
          prixStripe={prices}
          resiliation={resiliation}
          ancreMessagerie={ANCRE_MESSAGERIE}
        />

        {/* Le canal direct avec l'éditeur, placé ici et nulle part ailleurs.
            Pourquoi cette page : c'est déjà l'écran de la relation avec Jalon
            — formule, factures, quota de signatures — et c'est le seul écran
            réservé à ADMIN_OF, qui est exactement le public de ce fil.
            Surtout, pas dans /messagerie : celle-ci fait parler l'équipe entre
            elle, et y faire apparaître l'éditeur l'aurait fait passer pour un
            collègue, avec le risque qu'on lui écrive ce qu'on écrit à un
            collègue.
            L'id sert d'ancre aux boutons « écrire à l'équipe » plus haut, et
            de cible de défilement après le dépôt d'une demande : on montre le
            message parti plutôt que de demander de nous croire. */}
        <div id={ANCRE_MESSAGERIE} className="bg-white border border-line rounded-card p-5 flex flex-col gap-3 scroll-mt-6">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">Échanges avec {NOM_EDITEUR}</div>
            <div className="text-[11.5px] text-slate mt-0.5 leading-relaxed">
              Votre ligne directe avec l&apos;éditeur de la plateforme : une question sur votre abonnement, un
              incident, une demande d&apos;évolution. Rien ne sort de Jalon et vos apprenants n&apos;y ont aucun
              accès. Pour parler à votre équipe, utilisez la messagerie interne.
            </div>
          </div>
          <PlateformeMessagerie
            endpoint="/api/plateforme/messages/organisme"
            moiCamp="organization"
            titre={NOM_EDITEUR}
            sousTitre="Éditeur de votre plateforme"
            initiales={initialsOf(NOM_EDITEUR)}
            placeholder="Votre message à l'équipe Jalon… (Entrée pour envoyer)"
            vide="Aucun message pour l'instant. Écrivez ci-dessous : votre message arrive directement chez l'éditeur, sans passer par un e-mail."
          />
        </div>
      </div>
    </>
  );
}
