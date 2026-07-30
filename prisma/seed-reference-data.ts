import { PrismaClient } from "@prisma/client";
import { seedStarterTemplates } from "./lib/starter-templates";

const prisma = new PrismaClient();

// Global reference data only — no demo organization, users, or dossiers.
// Run this against a fresh production database (e.g. right after
// `prisma migrate deploy`) so real signups via /essai land in an app
// that already has its Qualiopi indicator list and starter document
// library populated, without any of prisma/seed.ts's demo tenant data.
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
    await prisma.qualiopiIndicator.upsert({
      where: { versionId_number: { versionId: "rnq2022v1", number: indicator.number } },
      update: indicator,
      create: { ...indicator, versionId: "rnq2022v1" },
    });
  }

  // A still-draft next version, so an org can look at what a reform would
  // ask of them before it's applicable — see the /actualites article on
  // anticipating a referential reform. This is illustrative content built
  // around commonly-discussed reform themes (traced accommodation requests,
  // documented regulatory watch, structured results indicators — the same
  // areas tasks #85/#86/#89/#91 build real tracking for), NOT an official
  // France Compétences text. status stays "projet" so it can never become
  // an org's active version by accident (see /qualiopi/referentiel UI).
  await prisma.qualiopiReferentielVersion.upsert({
    where: { id: "rnq2026-reforme-projet" },
    update: {},
    create: {
      id: "rnq2026-reforme-projet",
      label: "RNQ — Réforme 2026 (projet)",
      status: "projet",
      notes:
        "Version de travail, à titre indicatif — reprend les thèmes les plus souvent évoqués pour la prochaine révision du RNQ (traçabilité du handicap, veille réglementaire documentée, indicateurs de résultats structurés). Ne pas utiliser comme texte officiel : se référer à l'arrêté publié le moment venu.",
    },
  });

  const REFORME_2026_INDICATORS: { number: number; criterionNumber: number; label: string }[] = [
    ...QUALIOPI_INDICATORS.filter((i) => ![23, 26].includes(i.number)),
    { number: 23, criterionNumber: 6, label: "Veille légale et réglementaire documentée (source, date, décision, preuve d'exploitation)" },
    { number: 26, criterionNumber: 6, label: "Accueil et accompagnement des personnes en situation de handicap, avec traçabilité des aménagements accordés par bénéficiaire et référent handicap formé et actif" },
    { number: 33, criterionNumber: 7, label: "Indicateurs de résultats définis par une méthode de calcul explicite (formule, source, population, exclusions)" },
  ];

  for (const indicator of REFORME_2026_INDICATORS) {
    await prisma.qualiopiIndicator.upsert({
      where: { versionId_number: { versionId: "rnq2026-reforme-projet", number: indicator.number } },
      update: indicator,
      create: { ...indicator, versionId: "rnq2026-reforme-projet" },
    });
  }

  // Starter document library — global templates (organizationId: null)
  // every org sees and can adapt, shared with the demo seed so the two
  // copies can no longer drift (see prisma/lib/starter-templates.ts).
  const templateCount = await seedStarterTemplates(prisma);

  console.log(
    `Reference data seeded: ${QUALIOPI_INDICATORS.length} Qualiopi indicators (RNQ 2022) + ${REFORME_2026_INDICATORS.length} (réforme 2026, projet), ${templateCount} document templates.`
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
