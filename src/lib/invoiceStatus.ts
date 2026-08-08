import { DocStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { advanceOpportunityStage } from "@/lib/pipeline";
import { STAGES_BEFORE_COMPLETION } from "@/lib/pipelineStages";
import { METHODE_SOLDE_AUTOMATIQUE, encaissementFacture } from "@/lib/invoiceEncaissement";

/**
 * Changer le statut d'une facture — le seul endroit qui sait ce que ça
 * entraîne.
 *
 * Extrait de /api/facturation/invoices/[id] au moment où une seconde route
 * (le changement en masse) a eu besoin du même geste. Deux copies auraient
 * divergé sur l'effet de bord qui compte : passer une facture à « payée »
 * fait avancer l'affaire commerciale correspondante à « terminé ». Un lot
 * qui oublierait cette ligne laisserait le CRM en retard sur la
 * facturation, sans que rien ne le signale.
 *
 * ## « Marquer payé » ÉCRIT un règlement
 *
 * Cette fonction n'en écrivait aucun, au motif que « marquer payé » déclare
 * un état là où le formulaire d'encaissement saisit un montant. La
 * conséquence n'était pas tenable : les cinq écrans de facturation dérivent
 * le reste dû de la somme des `Payment`, donc une facture marquée payée à la
 * main s'y lisait « 0,00 € encaissé » — et remontait même dans le
 * rapprochement bancaire comme intégralement due. Le mot « encaissé » avait
 * deux définitions contradictoires selon l'écran.
 *
 * C'est le raisonnement de l'import d'historique (voir le commentaire de
 * /api/import/history vers la ligne 359, qui écrit lui aussi ses `Payment`
 * directement) : une ligne de règlement n'est pas facultative, c'est ce dont
 * les écrans dérivent tout le reste. Marquer payé crée donc le règlement du
 * SOLDE RESTANT, et `Payment` devient l'unique source de vérité.
 *
 * Trois précautions, toutes nécessaires :
 *
 *  - **le geste est réversible.** Le règlement porte la marque
 *    `METHODE_SOLDE_AUTOMATIQUE` ; repasser la facture en « Envoyé » le
 *    supprime, sinon il resterait un encaissement fantôme. Un règlement
 *    saisi à la main, encaissé par Stripe ou confirmé au relevé bancaire
 *    n'est jamais touché — c'est tout l'objet de la marque, et l'écran la
 *    nomme (« soldée en la marquant payée ») pour qu'elle ne soit pas un
 *    secret de la base ;
 *  - **le geste est idempotent.** Le montant écrit est le solde calculé par
 *    `encaissementFacture` — la MÊME fonction que celle qui affiche
 *    l'encaissé. Marquer payé deux fois trouve un solde nul la seconde fois
 *    et n'écrit rien ;
 *  - **un solde déjà nul n'écrit rien.** Une facture soldée par des
 *    règlements réels, ou une ancienne facture PAID couverte par le repli de
 *    `encaissementFacture`, ne gagne aucune ligne de plus.
 *
 * Ce que la fonction ne fait toujours PAS, et c'est délibéré : elle ne passe
 * pas par `recordInvoicePayment()`. Cette fonction-là fait converger les
 * canaux où de l'argent est réellement annoncé (saisie manuelle, Stripe,
 * rapprochement bancaire) et émet à ce titre le webhook `invoice.paid`. Ici
 * la ligne de règlement est la conséquence comptable d'une déclaration de
 * statut, défaisable d'un clic — et un lot de deux cents factures y
 * déclencherait deux cents appels HTTP sortants dans une seule requête.
 */
export async function appliquerStatutFacture(
  organizationId: string,
  invoiceId: string,
  status: DocStatus
): Promise<boolean> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { payments: { select: { amountCents: true, method: true } } },
  });
  if (!invoice) return false;

  // Le grand livre et le statut basculent ENSEMBLE. Séparés, un échec entre
  // les deux laisserait un règlement automatique sur une facture qui n'est
  // plus « Payé » — un encaissement fantôme que plus aucun écran ne signale,
  // puisque la mention qui le nomme ne s'affiche que sur une facture PAID.
  const ecritures = [];
  if (status === DocStatus.PAID) {
    // Le solde vu exactement comme l'écran le voit — repli compris, donc une
    // ancienne facture déjà PAID sans aucun règlement n'en gagne pas un
    // rétroactivement daté d'aujourd'hui.
    const { resteDuCents } = encaissementFacture(invoice);
    if (resteDuCents > 0) {
      ecritures.push(
        prisma.payment.create({
          data: {
            organizationId,
            invoiceId: invoice.id,
            amountCents: resteDuCents,
            method: METHODE_SOLDE_AUTOMATIQUE,
          },
        }),
      );
    }
  } else if (invoice.status === DocStatus.PAID) {
    // Sortie de « Payé » : on défait le règlement automatique, et lui seul.
    ecritures.push(
      prisma.payment.deleteMany({
        where: { invoiceId: invoice.id, organizationId, method: METHODE_SOLDE_AUTOMATIQUE },
      }),
    );
  }

  await prisma.$transaction([
    ...ecritures,
    prisma.invoice.update({ where: { id: invoice.id }, data: { status } }),
  ]);

  // Audit P1 : l'émission d'une facture ne déplace plus rien dans le CRM —
  // « Facturé » n'est plus une étape commerciale, l'état de la facture se
  // lit en Facturation. Seul l'encaissement complet clôt l'affaire.
  if (status === DocStatus.PAID) {
    await advanceOpportunityStage(organizationId, invoice.contactId, STAGES_BEFORE_COMPLETION, PipelineStage.COMPLETED);
  }
  return true;
}
