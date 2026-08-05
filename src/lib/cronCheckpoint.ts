import { prisma } from "@/lib/prisma";

/** Une seule chaîne pour l'instant — voir vercel.json. */
export const CHAINE_QUOTIDIENNE = "daily";

// Le seuil vit dans cronRunner.ts, avec la logique pure qui l'utilise et
// que les tests couvrent — ce fichier-ci touche la base.
export { SEUIL_BLOCAGE } from "@/lib/cronRunner";

export type EtatChaine = {
  depart: string | null;
  stalledRuns: number;
  lastFullPassAt: Date | null;
  /** Vrai si le passage précédent n'a pas eu le temps d'écrire sa fin. */
  precedentCoupe: boolean;
};

/**
 * Ouvre un passage : renvoie le point de reprise et constate si le passage
 * précédent s'est terminé.
 *
 * `runInProgress` encore posé = le processus précédent a été tué sans
 * pouvoir écrire quoi que ce soit. C'est le seul symptôme observable d'une
 * coupure par l'hébergeur, et le compteur qu'il alimente est ce qui rend la
 * panne visible plutôt que silencieuse.
 */
export async function ouvrirPassage(job: string): Promise<EtatChaine> {
  const existant = await prisma.cronCheckpoint.findUnique({ where: { job } });
  const precedentCoupe = existant?.runInProgress ?? false;
  const stalledRuns = precedentCoupe ? (existant?.stalledRuns ?? 0) + 1 : 0;

  await prisma.cronCheckpoint.upsert({
    where: { job },
    create: { job, nextStage: "", runInProgress: true, stalledRuns: 0 },
    update: { runInProgress: true, stalledRuns },
  });

  return {
    depart: existant?.nextStage || null,
    stalledRuns,
    lastFullPassAt: existant?.lastFullPassAt ?? null,
    precedentCoupe,
  };
}

/**
 * Enregistre l'étape sur le point d'être lancée. Appelé AVANT elle, jamais
 * après : si le processus meurt pendant, c'est cette écriture qui permettra
 * au passage suivant de la reprendre.
 */
export async function noterEtapeEnCours(job: string, etape: string): Promise<void> {
  await prisma.cronCheckpoint.update({ where: { job }, data: { nextStage: etape } });
}

/** Clôt le passage : point de reprise définitif, verrou retiré. */
export async function cloturerPassage(job: string, prochainDepart: string, tourComplet: boolean): Promise<void> {
  await prisma.cronCheckpoint.update({
    where: { job },
    data: {
      nextStage: prochainDepart,
      runInProgress: false,
      stalledRuns: 0,
      ...(tourComplet ? { lastFullPassAt: new Date() } : {}),
    },
  });
}

/** Lecture seule, pour l'affichage du back-office. */
export async function lireEtatChaine(job: string = CHAINE_QUOTIDIENNE) {
  return prisma.cronCheckpoint.findUnique({ where: { job } });
}
