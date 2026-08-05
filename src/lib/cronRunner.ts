/**
 * Exécution d'une chaîne de traitements quotidiens qui reprend là où elle
 * s'est arrêtée.
 *
 * Le problème qu'on répare (audit S7, P0 n°3) : tout était enchaîné dans une
 * seule exécution plafonnée à 60 secondes — enquêtes, relances, échéanciers,
 * synchronisation des boîtes mail, synthèses. Si les premières étapes
 * mangeaient le temps imparti, les dernières ne s'exécutaient jamais. Et
 * comme le lendemain repartait dans le même ordre, elles ne s'exécutaient
 * PLUS JAMAIS. Une panne définitive, et silencieuse : côté hébergeur, un
 * simple dépassement de temps dans un journal que personne ne lit.
 *
 * Deux idées suffisent à l'éliminer.
 *
 * 1. **La rotation.** Un passage démarre à l'étape où le précédent s'est
 *    arrêté, pas à la première. Aucune étape ne peut donc être affamée par
 *    celles qui la précèdent : chacune finit par passer en tête.
 *
 * 2. **Le point de reprise est écrit AVANT l'étape, pas après.** C'est ce
 *    qui rend la reprise robuste au cas le plus brutal — l'hébergeur qui
 *    coupe le processus en plein milieu, sans laisser le temps d'écrire
 *    quoi que ce soit. Le point de reprise désigne alors encore l'étape
 *    interrompue, que le passage suivant reprend depuis le début. C'est
 *    sans danger : chaque étape porte déjà sa propre marque
 *    d'idempotence (`needsAssessmentAutoReminderSentAt`, `status: SENT`,
 *    `sentAt`…), donc la rejouer n'envoie rien deux fois.
 *
 * Le budget se vérifie ENTRE les étapes, jamais pendant. On ne peut pas
 * interrompre proprement un envoi d'emails en cours ; la seule question
 * qu'on sait poser honnêtement est « ai-je encore le temps d'en commencer
 * une autre ? ».
 */

/** Une étape de la chaîne. `nom` est persisté : il ne doit pas changer. */
export type EtapeCron = {
  nom: string;
  /** Libellé lisible, pour le rapport rendu au back-office. */
  libelle: string;
  executer: () => Promise<unknown>;
};

export type ResultatEtape = {
  nom: string;
  libelle: string;
  /** `false` si l'étape a levé une exception — le passage continue quand même. */
  ok: boolean;
  detail?: unknown;
  erreur?: string;
  dureeMs: number;
};

export type PassageCron = {
  resultats: ResultatEtape[];
  /** Étapes non tentées faute de temps — elles passeront en tête demain. */
  differees: string[];
  /** À persister : l'étape par laquelle le prochain passage commencera. */
  prochainDepart: string;
  /** Vrai si toutes les étapes ont été tentées dans ce passage. */
  tourComplet: boolean;
};

/**
 * 60 s est le plafond de la plateforme (voir `maxDuration` dans la route).
 * On s'arrête d'en commencer de nouvelles à 40 s : la marge est là pour que
 * l'étape en cours ait le temps de finir. Elle ne garantit rien — une étape
 * qui à elle seule dépasse une minute sera coupée quoi qu'on fasse. C'est
 * précisément ce que `passagesBloques` rend visible plutôt que silencieux.
 */
export const BUDGET_ETAPES_MS = 40_000;

/**
 * Réordonne la chaîne pour qu'elle commence à `depart`, en la faisant
 * tourner. Un `depart` inconnu (étape renommée ou supprimée depuis le
 * dernier passage) repart du début plutôt que d'échouer : le point de
 * reprise est une optimisation, pas une donnée dont dépend la correction.
 */
export function ordonnerDepuis(etapes: EtapeCron[], depart: string | null): EtapeCron[] {
  if (etapes.length === 0) return [];
  const i = depart ? etapes.findIndex((e) => e.nom === depart) : -1;
  if (i <= 0) return [...etapes];
  return [...etapes.slice(i), ...etapes.slice(0, i)];
}

/** L'étape qui suit `nom` dans la chaîne, en bouclant. */
export function etapeSuivante(etapes: EtapeCron[], nom: string): string {
  const i = etapes.findIndex((e) => e.nom === nom);
  if (i === -1) return etapes[0]?.nom ?? nom;
  return etapes[(i + 1) % etapes.length].nom;
}

/**
 * Au-delà de ce nombre de passages coupés d'affilée, une étape ne tient
 * manifestement pas dans une exécution. Deux suffisent : une coupure isolée
 * arrive (redéploiement pendant le passage), deux de suite non.
 */
export const SEUIL_BLOCAGE = 2;

/**
 * La chaîne est quotidienne ; 48 h sans tour complet, c'est un jour entier
 * de sauté, pas un décalage d'horaire.
 */
export const RETARD_TOUR_COMPLET_H = 48;

export type DiagnosticChaine = { ton: "ok" | "alerte"; texte: string };

/**
 * Traduit l'état persisté en une phrase affichable dans le back-office.
 *
 * L'audit ne reprochait pas seulement à la panne d'être définitive, mais
 * d'être SILENCIEUSE. Un dépassement de temps ne produit qu'une ligne dans
 * un journal d'hébergeur que personne ne lit ; il fallait donc que l'état
 * de la chaîne apparaisse quelque part où quelqu'un regarde.
 *
 * L'absence de ligne n'est pas traitée comme « rien à signaler » : elle
 * signifie qu'aucun passage n'a jamais abouti, ce qui est précisément le
 * symptôme d'un CRON_SECRET absent ou d'une tâche non enregistrée chez
 * l'hébergeur. Le dire est parfois un faux positif le premier jour ; se
 * taire serait rejouer exactement le défaut qu'on répare.
 */
export function diagnosticChaine(
  etat: { nextStage: string; stalledRuns: number; lastFullPassAt: Date | null } | null,
  maintenant: Date
): DiagnosticChaine {
  if (!etat) {
    return { ton: "alerte", texte: "Aucun passage enregistré — la chaîne quotidienne n'a jamais abouti." };
  }
  if (etat.stalledRuns >= SEUIL_BLOCAGE) {
    return {
      ton: "alerte",
      texte: `L'étape « ${etat.nextStage} » est coupée avant d'avoir pu finir, ${etat.stalledRuns} passages de suite.`,
    };
  }
  if (!etat.lastFullPassAt) {
    return { ton: "alerte", texte: "Aucun tour complet à ce jour — des étapes sont reportées à chaque passage." };
  }
  const heures = (maintenant.getTime() - etat.lastFullPassAt.getTime()) / 3_600_000;
  if (heures >= RETARD_TOUR_COMPLET_H) {
    return {
      ton: "alerte",
      texte: `Dernier tour complet il y a ${Math.floor(heures / 24)} jours — la chaîne quotidienne ne suit plus.`,
    };
  }
  return { ton: "ok", texte: `Traitements automatiques — dernier tour complet il y a ${Math.round(heures)} h.` };
}

export async function executerChaine({
  etapes,
  depart,
  budgetMs = BUDGET_ETAPES_MS,
  horloge = () => Date.now(),
  avantEtape,
}: {
  etapes: EtapeCron[];
  depart: string | null;
  budgetMs?: number;
  /** Injectable pour les tests — aucune horloge réelle dans la logique. */
  horloge?: () => number;
  /**
   * Appelé juste AVANT de lancer l'étape, avec son nom. C'est là que le
   * point de reprise est persisté : si le processus est tué pendant
   * l'étape, c'est cette écriture-là qui permet de la reprendre.
   */
  avantEtape?: (nom: string) => Promise<void>;
}): Promise<PassageCron> {
  if (etapes.length === 0) {
    return { resultats: [], differees: [], prochainDepart: "", tourComplet: true };
  }

  const debut = horloge();
  const ordre = ordonnerDepuis(etapes, depart);
  const resultats: ResultatEtape[] = [];
  const differees: string[] = [];

  for (const etape of ordre) {
    // La première étape part toujours, même si le budget est déjà nul : un
    // budget mal réglé ne doit pas produire un passage qui ne fait rien du
    // tout et se contente de tourner le pointeur.
    const premiere = resultats.length === 0;
    if (!premiere && horloge() - debut >= budgetMs) {
      differees.push(etape.nom);
      continue;
    }

    await avantEtape?.(etape.nom);
    const t0 = horloge();
    try {
      const detail = await etape.executer();
      resultats.push({ nom: etape.nom, libelle: etape.libelle, ok: true, detail, dureeMs: horloge() - t0 });
    } catch (e) {
      // Une étape qui échoue ne bloque pas les suivantes, et surtout ne
      // devient pas un point de reprise permanent : ce serait recréer la
      // famine qu'on est en train de supprimer. L'erreur est rapportée.
      resultats.push({
        nom: etape.nom,
        libelle: etape.libelle,
        ok: false,
        erreur: e instanceof Error ? e.message : String(e),
        dureeMs: horloge() - t0,
      });
    }
  }

  const tourComplet = differees.length === 0;
  // Un tour complet remet la chaîne dans son ordre nominal. La rotation est
  // un rattrapage, pas un état : sans cette remise à zéro, un passage
  // coupé juste avant la synthèse quotidienne la ferait passer en tête —
  // et elle y resterait, définitivement décalée d'un jour, alors même que
  // tout tient de nouveau dans le temps imparti.
  const prochainDepart = tourComplet ? etapes[0].nom : differees[0];

  return { resultats, differees, prochainDepart, tourComplet };
}
