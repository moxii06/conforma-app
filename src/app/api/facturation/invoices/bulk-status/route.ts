import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { appliquerStatutFacture } from "@/lib/invoiceStatus";
import { MAX_FACTURES_PAR_LOT } from "@/lib/bulkLimits";

/**
 * Changer le statut de plusieurs factures d'un coup.
 *
 * Le cas quotidien qui manquait (audit S7, P2) : un OPCO vire une fois pour
 * trente dossiers. Sans ceci, il fallait ouvrir trente menus déroulants.
 *
 * Trois garde-fous, tous nécessaires :
 *  - le lot est plafonné, parce qu'une requête sans borne finit par
 *    dépasser le temps d'exécution alloué et laisser le travail à moitié
 *    fait, sans que personne ne sache où ;
 *  - chaque facture est traitée par appliquerStatutFacture, donc avec le
 *    MÊME effet que le menu déroulant unitaire — l'avancement de l'affaire
 *    commerciale quand la facture passe à « payée », ET l'écriture du
 *    règlement du solde restant (voir lib/invoiceStatus.ts). C'est ce qui
 *    fait qu'un virement d'OPCO soldant trente dossiers d'un coup produit
 *    exactement la même donnée que trente encaissements saisis un par un.
 *    Le geste inverse — repasser le lot en « Envoyé » — défait ces
 *    règlements automatiques, et eux seuls ;
 *  - la réponse dit combien ont abouti et nomme les références restées de
 *    côté. Un lot qui répondrait « c'est fait » sans distinguer serait pire
 *    que l'action une par une qu'il remplace.
 */

const schema = z.object({
  ids: z.array(z.string()).min(1).max(MAX_FACTURES_PAR_LOT),
  status: z.nativeEnum(DocStatus),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Requête invalide (au plus ${MAX_FACTURES_PAR_LOT} factures à la fois).` },
      { status: 400 }
    );
  }

  // Un seul aller-retour pour savoir lesquelles appartiennent bien à
  // l'organisation : c'est aussi ce qui donne leurs références, sans quoi
  // le compte rendu ne pourrait nommer que des identifiants techniques.
  const ids = [...new Set(parsed.data.ids)];
  const connues = await prisma.invoice.findMany({
    where: { id: { in: ids }, organizationId: session.organizationId },
    select: { id: true, reference: true },
  });
  const parId = new Map(connues.map((i) => [i.id, i.reference]));

  let modifiees = 0;
  const echecs: { reference: string; message: string }[] = [];
  // En série : chaque facture peut déclencher un avancement d'affaire, et
  // deux factures du même client se marcheraient dessus en parallèle. Deux
  // cents mises à jour restent très en dessous du budget d'une requête.
  for (const id of ids) {
    const reference = parId.get(id);
    if (!reference) {
      echecs.push({ reference: id, message: "Facture introuvable" });
      continue;
    }
    try {
      await appliquerStatutFacture(session.organizationId, id, parsed.data.status);
      modifiees++;
    } catch {
      echecs.push({ reference, message: "Échec de la mise à jour" });
    }
  }

  return NextResponse.json({ modifiees, echecs });
}
