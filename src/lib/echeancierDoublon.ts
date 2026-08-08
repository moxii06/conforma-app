import type { Instalment } from "@/lib/paymentSchedule";

/**
 * « L'échéancier de ce contrat a-t-il déjà été facturé à la main ? »
 *
 * Pourquoi la question se pose. « Marquer signé » (le retour papier, cas le
 * plus fréquent chez un petit organisme) n'appelait pas la matérialisation de
 * l'échéancier : un contrat signé en présentiel ne produisait donc aucune
 * facture. Un organisme qui a vécu des mois avec ce trou a forcément pris
 * l'habitude de créer ces factures lui-même après chaque signature. Le jour
 * où le correctif part en production, son premier « Marquer signé » lui
 * donnerait LES DEUX séries : les siennes et celles que Jalon vient de
 * créer. Double facturation, chez un vrai client, sur de l'argent réel.
 *
 * Le garde-fou d'idempotence existant ne voit que les factures DÉJÀ
 * matérialisées (`installmentNumber` non nul). Les factures saisies à la
 * main, elles, n'ont pas de numéro d'échéance : elles lui sont invisibles.
 * C'est ce trou-là que ce module ferme.
 *
 * ── Le critère retenu : LE TOTAL, au centime près ────────────────────────
 *
 * Trois critères étaient possibles ; c'est le plus difficile à déclencher
 * par erreur qui gagne, parce qu'un faux positif prive l'organisme de ses
 * factures d'échéancier sans qu'il l'ait demandé.
 *
 *   — le NOMBRE d'échéances se déclencherait en permanence : « ce client a
 *     trois factures impayées » est l'état normal d'un client actif, pas
 *     l'indice d'un doublon. Écarté.
 *   — les MONTANTS un à un ratent la forme la plus courante de la saisie
 *     manuelle : l'organisme facture souvent le prix en une seule fois là où
 *     le contrat prévoit trois échéances. Un critère qui rate le cas
 *     ordinaire ne protège de rien. Écarté.
 *   — le TOTAL couvre les deux formes (3 × 500 € comme 1 × 1 500 €) et ne se
 *     déclenche que si l'argent déjà porté au débit du client est exactement
 *     celui que le contrat promet. Et le « faux positif » qu'on lui
 *     reprocherait — une facture directe du même montant, pour la même
 *     formation, émise avant la signature — n'en est pas un : c'est
 *     précisément la même somme, déjà facturée. Retenu.
 *
 * Ce que le critère ne rattrape pas, assumé : un échéancier partiellement
 * facturé à la main (l'acompte encaissé, le solde pas encore saisi) ne
 * totalise pas le contrat, donc la matérialisation a lieu et l'acompte se
 * retrouve en double. Élargir jusqu'à couvrir ce cas — un total *approchant*,
 * un sous-ensemble de montants — rendrait le déclenchement flou, et un
 * garde-fou flou qui bloque à tort est pire que le défaut qu'il corrige.
 * L'appelant est averti dans tous les cas ; c'est là que le jugement humain
 * reprend la main.
 *
 * Fonctions pures : aucune requête, aucun Prisma. C'est la seule partie de
 * la chaîne de signature qui décide quelque chose, donc la seule qui a
 * besoin d'être testée — et la seule qui puisse l'être avec la config Vitest
 * actuelle.
 */

/** Une facture déjà présente, réduite à ce dont la décision a besoin. */
export type FactureExistante = { amountCents: number };

export type VerdictDoublonEcheancier = {
  /** Vrai si l'échéancier semble déjà facturé — voir le critère ci-dessus. */
  dejaFacture: boolean;
  totalEcheancierCentimes: number;
  totalFacturesCentimes: number;
  nombreFactures: number;
};

export function verifierEcheancierDejaFacture(
  echeancier: readonly Pick<Instalment, "amountCents">[],
  facturesExistantes: readonly FactureExistante[],
): VerdictDoublonEcheancier {
  const totalEcheancierCentimes = echeancier.reduce((somme, e) => somme + e.amountCents, 0);
  const totalFacturesCentimes = facturesExistantes.reduce((somme, f) => somme + f.amountCents, 0);
  return {
    // Un total nul ne prouve rien : deux zéros qui se ressemblent ne font
    // pas un doublon, et un échéancier vide n'a de toute façon rien à
    // matérialiser. Idem sans aucune facture en face — sinon un échéancier
    // à 0 € bloquerait tout seul.
    dejaFacture:
      totalEcheancierCentimes > 0 &&
      facturesExistantes.length > 0 &&
      totalEcheancierCentimes === totalFacturesCentimes,
    totalEcheancierCentimes,
    totalFacturesCentimes,
    nombreFactures: facturesExistantes.length,
  };
}

/**
 * Ce que l'organisme doit lire quand la matérialisation a été écartée.
 *
 * Le message dit les trois choses qu'il lui faut pour trancher lui-même :
 * ce qui n'a PAS été fait, sur quoi s'est fondée la décision (le nombre de
 * factures et leur total), et où aller vérifier. Un « des factures
 * existaient déjà » sans chiffres l'obligerait à tout recompter à la main.
 */
export function messageDoublonEcheancier(verdict: VerdictDoublonEcheancier): string {
  const plusieurs = verdict.nombreFactures > 1;
  const s = plusieurs ? "s" : "";
  return (
    `L'échéancier de ce contrat n'a pas été transformé en factures : ` +
    `${verdict.nombreFactures} facture${s} impayée${s} totalisant ` +
    `${formatEuros(verdict.totalFacturesCentimes)} ${plusieurs ? "existent" : "existe"} déjà pour ce client — ` +
    `exactement le montant de l'échéancier. ${plusieurs ? "Jalon ne les a pas doublées." : "Jalon ne l'a pas doublée."} ` +
    `Vérifiez dans Facturation, et complétez à la main les échéances qui manqueraient.`
  );
}

function formatEuros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
