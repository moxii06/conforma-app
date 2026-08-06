import { prisma } from "@/lib/prisma";
import { FAQ_STARTER_STEPS } from "@/lib/faqContent";
import { recordActivationEvent } from "@/lib/activation";
import { etapeMediationFaite, vendAuxParticuliers } from "@/lib/mediationConsommation";

// Le parcours de démarrage existait déjà, écrit et ordonné, dans la FAQ —
// mais en texte statique : il fallait aller le chercher, et rien ne disait où
// on en était. Un nouvel inscrit arrive sur une plateforme vide et repart
// sans avoir su par où commencer.
//
// Ici, chaque étape est confrontée à l'état réel de l'organisation. La
// source du contenu reste FAQ_STARTER_STEPS : les deux affichages doivent
// raconter la même chose, et une étape ajoutée à la FAQ ne doit pas être
// oubliée ici. L'ordre de FAQ_STARTER_STEPS est repris tel quel — c'est lui
// qui évite les murs du type « pourquoi ce bouton est-il grisé ».

export type OnboardingStep = {
  title: string;
  detail: string;
  done: boolean;
  href: string;
};

// Une entrée par étape de FAQ_STARTER_STEPS, dans le même ordre. Le lien est
// celui de l'écran où l'étape se fait, pas de la page d'aide qui l'explique.
const STEP_LINKS = [
  "/profil",
  "/team",
  "/formations",
  "/formations",
  "/planning",
  "/integrations",
  "/profil#particuliers",
];

export async function getOnboardingSteps(organizationId: string): Promise<OnboardingStep[]> {
  const [org, courseCount, moduleCount, dossierCount, mailboxCount] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        legalForm: true,
        rcsNumber: true,
        legalRepresentativeName: true,
        referentHandicapUserId: true,
        mediatorName: true,
      },
    }),
    prisma.course.count({ where: { organizationId } }),
    prisma.elearningModule.count({ where: { course: { organizationId } } }),
    prisma.dossier.count({ where: { organizationId } }),
    prisma.mailboxConnection.count({ where: { organizationId } }),
  ]);

  // Le signal de vente au particulier : deux `findFirst` indexés qui ne
  // rendent qu'un id. On cherche l'existence, pas le volume — une seule
  // vente suffit à faire naître l'obligation.
  const [contratParticulier, factureFondsPropres] = await Promise.all([
    prisma.document.findFirst({ where: { organizationId, category: "contrat_formation" }, select: { id: true } }),
    prisma.invoice.findFirst({ where: { organizationId, fundingOrigin: "individual" }, select: { id: true } }),
  ]);
  const signalParticulier = {
    contratsParticulier: contratParticulier ? 1 : 0,
    facturesFondsPropres: factureFondsPropres ? 1 : 0,
  };

  const done = [
    // Les trois mentions légales qui partent réellement dans les documents
    // générés. Le logo n'en fait pas partie : joli, mais pas bloquant.
    Boolean(org.legalForm && org.rcsNumber && org.legalRepresentativeName),
    // Le référent handicap SEUL fait foi. Compter aussi "l'équipe a plus
    // d'un membre" validait l'étape pour un OF de cinq personnes sans
    // référent désigné — alors que c'est l'attendu Qualiopi de l'étape, et
    // que l'invitation d'équipe n'a aucun sens pour un OF d'une personne,
    // qui reste majoritaire sur cette cible.
    Boolean(org.referentHandicapUserId),
    courseCount > 0,
    moduleCount > 0,
    // Une session sans personne dedans n'est pas l'étape franchie : c'est
    // l'inscription qui débloque tout ce qui suit.
    dossierCount > 0,
    mailboxCount > 0,
    // L'adhésion à un médiateur — cochée quand elle est faite, OU quand elle
    // ne s'applique pas.
    //
    // L'obligation de l'art. L.612-1 ne vise que le professionnel qui
    // contracte avec un consommateur. Un organisme qui ne vend qu'à des
    // entreprises n'y est pas tenu : lui laisser une étape éternellement
    // rouge — et l'empêcher à jamais d'atteindre `onboarding_completed` —
    // serait une fausse alerte permanente. Le libellé de l'étape le dit
    // (« Sans objet si vous ne vendez qu'à des entreprises »).
    //
    // « À faire plus tard », lui, ne coche RIEN : il fait taire le rappel du
    // tableau de bord, pas la check-list. Une check-list qui annonce terminé
    // ce qui ne l'est pas ne sert plus à rien.
    etapeMediationFaite({ mediateurRenseigne: Boolean(org.mediatorName?.trim()) }) ||
      !vendAuxParticuliers(signalParticulier),
  ];

  if (done.every(Boolean)) {
    // Fire-and-forget : recordActivationEvent est un upsert idempotent
    // (contrainte unique organizationId+type), donc l'appeler à chaque
    // rendu du tableau de bord une fois l'onboarding fini ne crée jamais
    // de doublon — pas besoin de détecter la transition précisément.
    await recordActivationEvent(organizationId, "onboarding_completed");
  }

  return FAQ_STARTER_STEPS.map((step, i) => ({
    title: step.title,
    detail: step.detail,
    done: done[i] ?? false,
    href: STEP_LINKS[i] ?? "/faq",
  }));
}

/** L'étape suivante à faire, ou null quand tout est fait. */
export function nextStep(steps: OnboardingStep[]): OnboardingStep | null {
  return steps.find((s) => !s.done) ?? null;
}
