import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { ecrireFilPlateforme } from "@/lib/messageriePlateforme";
import { CLES_FORMULES, libelleFormule } from "@/lib/tarifs";
import { isBrevoConfigured, sendTransactionalEmail } from "@/lib/brevo";
import { platformContactEmail } from "@/lib/platformAdmin";

/**
 * Les demandes d'abonnement qui ne passent PAS par Stripe.
 *
 * Tant que la souscription en ligne n'est pas activée — et même quand elle
 * l'est, pour une résiliation ou une question commerciale — un changement de
 * formule est une conversation, pas une transaction. Cette route dépose donc
 * la demande dans le fil éditeur ↔ organisme existant (PlatformThread, voir
 * lib/messageriePlateforme.ts) plutôt que dans un formulaire de contact
 * parallèle.
 *
 * POURQUOI CE CANAL ET PAS UN AUTRE : le fil est déjà affiché en bas de
 * /abonnement, l'éditeur le lit déjà depuis la fiche de l'organisme sur
 * /plateforme, et il est déjà réservé à ADMIN_OF. Un second canal aurait créé
 * l'endroit où une demande de résiliation peut se perdre parce que personne ne
 * regarde cette boîte-là. La demande apparaît immédiatement dans le fil sous
 * les yeux de celui qui vient de cliquer : il voit ce qui est parti.
 *
 * Rien n'est facturé, rien n'est résilié ici. La route enregistre une demande
 * et le dit — l'écran ne prétend pas le contraire.
 */

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("changement"), formule: z.enum(CLES_FORMULES) }),
  z.object({ type: z.literal("resiliation"), motif: z.string().max(2000).optional() }),
  z.object({ type: z.literal("commercial") }),
]);

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Même porte que /abonnement et que les routes checkout/portal : engager ou
  // rompre l'abonnement de l'organisme est une décision d'administrateur.
  if (ctx.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Seul l'administrateur peut gérer l'abonnement." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Demande incomprise." }, { status: 400 });
  const demande = parsed.data;

  // La formule en cours est RELUE en base, jamais reprise du client : c'est
  // elle qui donne son sens à « je veux passer sur Team » (montée ou descente,
  // depuis quoi), et un écran ouvert depuis une heure peut l'avoir périmée.
  const [organization, subscription] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } }),
    prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { plan: true },
    }),
  ]);

  const formuleActuelle = subscription ? libelleFormule(subscription.plan) : "aucune formule enregistrée";
  const corps = composerCorps(demande, formuleActuelle);

  // Le corps est composé ICI et non reçu du client : c'est la trace écrite
  // d'une demande contractuelle, et elle doit dire ce qui a réellement été
  // cliqué. Seul le motif libre de la résiliation vient de l'utilisateur.
  const message = await ecrireFilPlateforme(
    ctx.organizationId,
    "organization",
    ctx.name || ctx.email,
    corps,
  );

  // Doublure e-mail vers l'éditeur, volontairement non bloquante — même parti
  // pris que le webhook Stripe : une notification interne qui échoue ne doit
  // pas faire échouer la demande, qui est déjà enregistrée dans le fil.
  void notifierEditeur(organization.name, corps).catch(() => {});

  return NextResponse.json({ message, enregistre: true }, { status: 201 });
}

function composerCorps(
  demande: z.infer<typeof schema>,
  formuleActuelle: string,
): string {
  switch (demande.type) {
    case "changement":
      return [
        `Demande de changement de formule : passer de ${formuleActuelle} à ${libelleFormule(demande.formule)}.`,
        "Merci de me confirmer la date de prise d'effet et le montant au prorata s'il y en a un.",
      ].join("\n\n");

    case "resiliation": {
      const motif = demande.motif?.trim();
      return [
        `Demande de résiliation de l'abonnement (formule en cours : ${formuleActuelle}).`,
        ...(motif ? [`Motif indiqué : ${motif}`] : []),
        "Merci de me confirmer la date d'effet et les modalités de récupération de nos données.",
      ].join("\n\n");
    }

    case "commercial":
      return [
        `Demande de contact commercial (formule en cours : ${formuleActuelle}).`,
        "J'aimerais échanger sur mon abonnement.",
      ].join("\n\n");
  }
}

async function notifierEditeur(nomOrganisme: string, corps: string): Promise<void> {
  const destinataire = platformContactEmail();
  if (!destinataire || !isBrevoConfigured()) return;
  await sendTransactionalEmail({
    to: destinataire,
    toName: "Équipe Jalon",
    senderName: "Jalon",
    subject: `Demande d'abonnement : ${nomOrganisme}`,
    text: `${nomOrganisme} vient de déposer une demande depuis /abonnement.\n\n${corps}\n\nRépondre depuis la fiche de l'organisme : /plateforme`,
  });
}
