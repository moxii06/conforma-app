/**
 * Combien de lignes une action de masse accepte en une fois.
 *
 * Vit ici plutôt que dans les routes parce que les pages en ont besoin
 * aussi : c'est ce plafond qui décide combien de candidats la page va
 * chercher pour alimenter le dialogue de confirmation. Les deux doivent
 * s'accorder, sans quoi la page proposerait des lignes que la route
 * refuserait — et le refus arriverait après le clic de validation.
 *
 * Le nombre lui-même n'a rien de sacré : il borne le temps d'une requête,
 * et il est assez large pour couvrir le cas qui a motivé tout ceci (un
 * virement d'OPCO qui solde plusieurs dizaines de factures).
 */
export const MAX_FACTURES_PAR_LOT = 200;
export const MAX_CONTACTS_PAR_LOT = 200;
