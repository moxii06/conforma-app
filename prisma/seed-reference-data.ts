import { PrismaClient } from "@prisma/client";
import { seedStarterTemplates } from "./lib/starter-templates";
import { seedSubcontractorRequirements } from "./lib/subcontractor-requirements";

const prisma = new PrismaClient();

// Global reference data only — no demo organization, users, or dossiers,
// so real signups via /essai land in an app that already has its Qualiopi
// indicator list and starter document library, without any of
// prisma/seed.ts's demo tenant data.
//
// Runs on every deploy, wired into `build` right after `prisma migrate
// deploy`. That is deliberate: this is Jalon's own content, and leaving it
// to a manual run meant it simply never happened — the two conditional
// document templates sat in this file for weeks while production showed
// "Modèles conditionnels : 0", so the whole feature was invisible to
// customers. Every future improvement to a starter template would have hit
// the same wall.
//
// Safe to repeat: every write is an upsert keyed on something stable
// (indicator number, template title), and every row it touches is global
// (organizationId: null). An organization's own adapted copy is a separate
// row and is never read or written here — see ForkTemplateButton.
//
// A failure fails the build rather than being swallowed. Blocking a deploy
// is the lesser harm: a seed that quietly half-ran is indistinguishable
// from one that worked, which is exactly how this got missed.
async function main() {
  // Référentiel National Qualité — 7 criteria / 32 indicators, shared
  // reference data (not tenant-scoped). Labels are working summaries for
  // the scaffold; verify wording against the official France Compétences
  // referential before relying on them for an actual audit (see comment on
  // the QualiopiIndicator model in schema.prisma).
  // Corrected against the official RNQ structure (décret n°2019-565, guide de
  // lecture) — the array below replaces an earlier scaffold version whose
  // numbering/critère groupings from indicator 7 onward didn't match the
  // real referential (critère 3 was truncated to 7 items instead of 8,
  // "positionnement à l'entrée" was misplaced under critère 3 instead of 2,
  // "référent handicap" was attached to a CFA-only indicator 20 instead of
  // the general indicator 26, etc.). Cross-checked against two independent
  // sources plus the real AB Certification audit documents used to build
  // the S1/S2/S3 audit reports in this project's history.
  // Les indicateurs spécifiques aux actions de formation par apprentissage.
  // Un OF qui n'en fait pas ne peut structurellement pas les couvrir : sans
  // cette liste, ils comptent comme des trous de conformité inexistants.
  const APPRENTISSAGE_ONLY = [13, 14, 15, 16, 20];

  const QUALIOPI_INDICATORS: { number: number; criterionNumber: number; label: string }[] = [
    { number: 1, criterionNumber: 1, label: "Information accessible au public sur les prestations, délais d'accès et résultats obtenus" },
    { number: 2, criterionNumber: 1, label: "Diffusion d'indicateurs de résultats adaptés à la nature des prestations et des publics" },
    { number: 3, criterionNumber: 1, label: "Information du public sur le taux d'obtention des certifications visées, le cas échéant" },
    { number: 4, criterionNumber: 2, label: "Analyse du besoin du bénéficiaire en lien avec l'entreprise et/ou le financeur" },
    { number: 5, criterionNumber: 2, label: "Détermination d'objectifs opérationnels et évaluables de la prestation" },
    { number: 6, criterionNumber: 2, label: "Détermination de contenus et modalités adaptés aux objectifs de la prestation" },
    { number: 7, criterionNumber: 2, label: "Adéquation du contenu de la prestation aux exigences de la certification visée" },
    { number: 8, criterionNumber: 2, label: "Détermination des procédures de positionnement et d'évaluation des acquis à l'entrée de la prestation" },
    { number: 9, criterionNumber: 3, label: "Information sur les conditions de déroulement de la prestation" },
    { number: 10, criterionNumber: 3, label: "Adaptation de la prestation, son suivi et son évaluation aux publics bénéficiaires" },
    { number: 11, criterionNumber: 3, label: "Évaluation de l'atteinte par les bénéficiaires des objectifs de la prestation" },
    { number: 12, criterionNumber: 3, label: "Mesures favorisant l'engagement des bénéficiaires et prévenant les ruptures de parcours" },
    { number: 13, criterionNumber: 3, label: "Coordination entre le centre de formation et l'entreprise pour le suivi des apprentis (alternance)" },
    { number: 14, criterionNumber: 3, label: "Accompagnement socio-professionnel et exercice de la citoyenneté des apprentis (alternance)" },
    { number: 15, criterionNumber: 3, label: "Information des apprentis sur leurs droits et devoirs (alternance)" },
    { number: 16, criterionNumber: 3, label: "Conditions de présentation des candidats aux épreuves de certification (alternance)" },
    { number: 17, criterionNumber: 4, label: "Adéquation des moyens humains et techniques mobilisés à la prestation" },
    { number: 18, criterionNumber: 4, label: "Coordination des différents intervenants mobilisés sur la prestation" },
    { number: 19, criterionNumber: 4, label: "Mise à disposition de ressources pédagogiques et d'un environnement adaptés, y compris à distance" },
    { number: 20, criterionNumber: 4, label: "Personnel dédié à l'accompagnement des apprentis : mobilité, référent handicap, conseil de perfectionnement (CFA)" },
    { number: 21, criterionNumber: 5, label: "Détermination et mobilisation des compétences des intervenants internes et/ou externes" },
    { number: 22, criterionNumber: 5, label: "Complétude et actualisation des compétences des personnels chargés des prestations" },
    { number: 23, criterionNumber: 6, label: "Veille légale et réglementaire sur son secteur d'activité" },
    { number: 24, criterionNumber: 6, label: "Veille sur les évolutions des compétences, métiers et emplois" },
    { number: 25, criterionNumber: 6, label: "Veille sur les innovations pédagogiques et technologiques" },
    { number: 26, criterionNumber: 6, label: "Accueil et accompagnement des personnes en situation de handicap, avec un référent identifié" },
    { number: 27, criterionNumber: 6, label: "Conformité de la sous-traitance ou de la cotraitance au référentiel qualité" },
    { number: 28, criterionNumber: 6, label: "Mobilisation d'un réseau de partenaires socio-économiques utiles à la prestation" },
    { number: 29, criterionNumber: 6, label: "Insertion professionnelle et poursuite d'étude des bénéficiaires à l'issue de la prestation" },
    { number: 30, criterionNumber: 7, label: "Recueil des appréciations des parties prenantes (bénéficiaires, financeurs, équipes pédagogiques)" },
    { number: 31, criterionNumber: 7, label: "Traitement des difficultés, réclamations, litiges et abandons signalés" },
    { number: 32, criterionNumber: 7, label: "Mise en œuvre d'un dispositif d'amélioration continue à partir des appréciations et réclamations" },
  ];

  // "rnq2022v1" is the fixed id the qualiopi_referentiel_version migration
  // gives the version every pre-existing indicator/org was backfilled onto
  // — reused here (upsert, not create) so this script stays idempotent
  // against a database that already ran that migration.
  await prisma.qualiopiReferentielVersion.upsert({
    where: { id: "rnq2022v1" },
    update: {},
    create: {
      id: "rnq2022v1",
      label: "RNQ 2022 (en vigueur)",
      status: "applicable",
      publishedAt: new Date("2022-01-01"),
      applicableFrom: new Date("2022-01-01"),
      notes: "Référentiel National Qualité en vigueur depuis le lancement de Qualiopi.",
    },
  });

  for (const indicator of QUALIOPI_INDICATORS) {
    const row = { ...indicator, scope: APPRENTISSAGE_ONLY.includes(indicator.number) ? "apprentissage" : "all" };
    await prisma.qualiopiIndicator.upsert({
      where: { versionId_number: { versionId: "rnq2022v1", number: indicator.number } },
      update: row,
      create: { ...row, versionId: "rnq2022v1" },
    });
  }

  // ---------------------------------------------------------------------
  // Le projet de décret NOR TRSD2609875D, qui actualiserait l'annexe du
  // code du travail fixant les indicateurs du RNQ, pour une entrée en
  // vigueur annoncée au 1er novembre 2026.
  //
  // NON PUBLIÉ AU JOURNAL OFFICIEL à la date de rédaction (31 juillet 2026).
  // Le texte applicable reste le décret n° 2019-565 du 6 juin 2019. Le
  // statut "projet" est ce qui empêche cette version de devenir la version
  // active d'une organisation, et l'UI le répète à l'écran : un OF qui
  // préparerait son audit sur ce texte se tromperait de référentiel.
  //
  // Une version précédente de ce bloc inventait son contenu à partir des
  // « thèmes souvent évoqués ». C'était faux sur le point le plus visible :
  // le 33e indicateur y portait sur les indicateurs de résultats, alors
  // qu'il est en réalité spécifique à l'apprentissage. Le contenu ci-dessous
  // est repris de quatre analyses concordantes du projet (Certiforma,
  // Reltim, AB Certification, Open-S, juillet 2026) — pas du texte officiel,
  // qu'il faudra retranscrire à la publication.
  //
  // Les libellés restent ceux de la version en vigueur : un OF reconnaît
  // ses indicateurs par le libellé qu'il connaît, et ce qu'il veut d'une
  // réforme c'est le delta. Ce delta vit dans changeNote.
  // ---------------------------------------------------------------------
  await prisma.qualiopiReferentielVersion.upsert({
    where: { id: "rnq2026-reforme-projet" },
    update: {
      label: "RNQ — projet de décret (1er novembre 2026)",
      applicableFrom: new Date("2026-11-01"),
      notes:
        "Projet de décret NOR TRSD2609875D, non publié au Journal officiel à ce jour — le texte applicable reste le décret n° 2019-565 du 6 juin 2019. Entrée en vigueur annoncée au 1er novembre 2026, sous réserve de publication. Contenu reconstitué à partir d'analyses publiques concordantes du projet, à titre de préparation : ne pas l'utiliser comme texte de référence pour un audit.",
    },
    create: {
      id: "rnq2026-reforme-projet",
      label: "RNQ — projet de décret (1er novembre 2026)",
      status: "projet",
      applicableFrom: new Date("2026-11-01"),
      notes:
        "Projet de décret NOR TRSD2609875D, non publié au Journal officiel à ce jour — le texte applicable reste le décret n° 2019-565 du 6 juin 2019. Entrée en vigueur annoncée au 1er novembre 2026, sous réserve de publication. Contenu reconstitué à partir d'analyses publiques concordantes du projet, à titre de préparation : ne pas l'utiliser comme texte de référence pour un audit.",
    },
  });

  // Ce qui change, indicateur par indicateur. Deux phrases chacun : ce que le
  // projet ajoute, puis ce que l'OF devra pouvoir montrer à l'auditeur —
  // parce qu'« l'indicateur 19 évolue » ne dit à personne quoi faire lundi.
  const REFORME_2026_CHANGES: Record<number, string> = {
    1: "S'ajoutent le type de reconnaissance obtenue à l'issue de la formation, les modalités pédagogiques et les modalités de financement ; l'information ne doit pas induire en erreur sur les poursuites d'études possibles. À montrer : une fiche formation publique complète, datée et vérifiable.",
    2: "Il ne suffira plus de publier les taux : leurs modalités de calcul devront l'être aussi, pour que les résultats soient comparables d'un organisme à l'autre. À montrer : pour chaque indicateur, sa formule, sa source, la population comptée et les exclusions.",
    3: "Information renforcée sur les certifications visées : taux d'obtention, blocs de compétences, équivalences et passerelles, débouchés et poursuites d'études.",
    7: "L'adéquation à la certification ne se déclare plus : il faudra prouver la capacité effective à y préparer et à la faire passer. À montrer : habilitation du certificateur ou convention de partenariat en cours de validité.",
    12: "L'engagement des bénéficiaires intègre la prévention et le traitement des violences, du harcèlement et des discriminations. À montrer : une procédure écrite, portée à la connaissance des bénéficiaires, et la trace de son application.",
    14: "Les ruptures de parcours devront être traitées sans délai, et l'accompagnement couvrir explicitement les situations de violence et de discrimination.",
    15: "Protection renforcée des apprentis mineurs, communication des coordonnées du médiateur de l'apprentissage, et procédure de signalement des dysfonctionnements.",
    19: "Mettre les ressources à disposition ne suffira plus : il faudra démontrer l'effectivité du suivi, en particulier à distance (connexions, progression, assiduité réelle), et désigner un référent pédagogique. À montrer : des traces de suivi par apprenant, pas une attestation globale.",
    20: "Participation des apprentis, des formateurs et des entreprises à la gouvernance, et supervision renforcée du personnel dédié.",
    27: "La conformité du sous-traitant devra être tracée contractuellement, et le portage salarial est explicitement couvert. À montrer : un contrat par intervenant externe, mentionnant le respect du référentiel.",
    32: "L'amélioration continue ne part plus seulement des réclamations : une analyse des risques qualité des formations est attendue. À montrer : un registre des risques avec probabilité, gravité, responsable et mesure préventive.",
    33: "Nouvel indicateur. Un dispositif d'évaluation des contenus et des enseignements par les apprentis, distinct de l'enquête de satisfaction générale, dont les résultats sont partagés avec les équipes pédagogiques et donnent lieu à une amélioration mesurée.",
  };

  const REFORME_2026_INDICATORS: { number: number; criterionNumber: number; label: string }[] = [
    ...QUALIOPI_INDICATORS,
    {
      number: 33,
      criterionNumber: 7,
      label:
        "Évaluation des contenus et des enseignements par les apprentis, distincte de l'enquête de satisfaction (apprentissage)",
    },
  ];

  // Une clé pointant vers un numéro qui n'existe pas perdrait sa note de
  // changement sans rien signaler — l'écran afficherait un indicateur de
  // moins comme « touché », ce que personne ne remarquerait. Le seed tourne
  // dans `npm run build` : mieux vaut casser le déploiement.
  const unknownChangeKeys = Object.keys(REFORME_2026_CHANGES)
    .map(Number)
    .filter((n) => !REFORME_2026_INDICATORS.some((i) => i.number === n));
  if (unknownChangeKeys.length > 0) {
    throw new Error(
      `REFORME_2026_CHANGES référence des indicateurs inexistants : ${unknownChangeKeys.join(", ")}`,
    );
  }

  for (const indicator of REFORME_2026_INDICATORS) {
    const row = {
      ...indicator,
      changeNote: REFORME_2026_CHANGES[indicator.number] ?? null,
      scope: [...APPRENTISSAGE_ONLY, 33].includes(indicator.number) ? "apprentissage" : "all",
    };
    await prisma.qualiopiIndicator.upsert({
      where: { versionId_number: { versionId: "rnq2026-reforme-projet", number: indicator.number } },
      update: row,
      create: { ...row, versionId: "rnq2026-reforme-projet" },
    });
  }

  // Starter document library — global templates (organizationId: null)
  // every org sees and can adapt, shared with the demo seed so the two
  // copies can no longer drift (see prisma/lib/starter-templates.ts).
  const templateCount = await seedStarterTemplates(prisma);

  // La seule écriture de ce script qui porte un organizationId, et c'est
  // contraint : SubcontractorDocumentRequirement n'accepte pas de ligne
  // globale. Elle ne touche QUE les organismes dont la table est vide, donc
  // elle ne peut pas ressusciter une pièce qu'un OF a retirée — voir le
  // commentaire d'en-tête de prisma/lib/subcontractor-requirements.ts.
  const orgsPourvus = await seedSubcontractorRequirements(prisma);

  console.log(
    `Reference data seeded: ${QUALIOPI_INDICATORS.length} Qualiopi indicators (RNQ 2022) + ${REFORME_2026_INDICATORS.length} (réforme 2026, projet), ${templateCount} document templates, pièces attendues posées chez ${orgsPourvus} organisme(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
