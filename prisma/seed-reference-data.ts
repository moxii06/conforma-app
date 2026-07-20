import { PrismaClient } from "@prisma/client";

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
  const QUALIOPI_INDICATORS: { number: number; criterionNumber: number; label: string }[] = [
    { number: 1, criterionNumber: 1, label: "Information accessible au public sur les prestations, délais d'accès et résultats obtenus" },
    { number: 2, criterionNumber: 1, label: "Diffusion d'indicateurs de résultats adaptés à la nature des prestations et des publics" },
    { number: 3, criterionNumber: 1, label: "Information du public sur les prérequis et modalités d'accès à la prestation" },
    { number: 4, criterionNumber: 2, label: "Analyse du besoin du bénéficiaire en lien avec l'entreprise et/ou le financeur" },
    { number: 5, criterionNumber: 2, label: "Détermination d'objectifs opérationnels et évaluables de la prestation" },
    { number: 6, criterionNumber: 2, label: "Détermination de contenus et modalités adaptés aux objectifs de la prestation" },
    { number: 7, criterionNumber: 3, label: "Information sur les conditions de déroulement de la prestation" },
    { number: 8, criterionNumber: 3, label: "Information sur les moyens de suivre l'exécution et d'apprécier les résultats" },
    { number: 9, criterionNumber: 3, label: "Adaptation de la prestation, son suivi et son évaluation aux publics bénéficiaires" },
    { number: 10, criterionNumber: 3, label: "Évaluation de l'atteinte par les bénéficiaires des objectifs de la prestation" },
    { number: 11, criterionNumber: 3, label: "Mesures favorisant l'engagement des bénéficiaires et prévenant les ruptures de parcours" },
    { number: 12, criterionNumber: 3, label: "Coordination avec les autres acteurs intervenant dans la prestation" },
    { number: 13, criterionNumber: 3, label: "Accompagnement spécifique des publics en situation de handicap" },
    { number: 14, criterionNumber: 4, label: "Adéquation des moyens pédagogiques, techniques et d'encadrement aux prestations" },
    { number: 15, criterionNumber: 4, label: "Mise à disposition de ressources pédagogiques et d'un environnement adaptés" },
    { number: 16, criterionNumber: 4, label: "Adaptations mises en œuvre et suivies pour les publics en situation de handicap" },
    { number: 17, criterionNumber: 5, label: "Qualification et compétences des intervenants internes et/ou externes" },
    { number: 18, criterionNumber: 5, label: "Complétude et actualisation des compétences des personnels" },
    { number: 19, criterionNumber: 5, label: "Coordination et supervision des différents intervenants" },
    { number: 20, criterionNumber: 5, label: "Désignation d'un référent handicap" },
    { number: 21, criterionNumber: 5, label: "Développement des compétences des personnels chargés des prestations" },
    { number: 22, criterionNumber: 6, label: "Veille légale et réglementaire sur son secteur d'activité" },
    { number: 23, criterionNumber: 6, label: "Veille sur les évolutions des compétences, métiers et emplois" },
    { number: 24, criterionNumber: 6, label: "Veille sur les innovations pédagogiques et technologiques" },
    { number: 25, criterionNumber: 6, label: "Mobilisation des expertises, réseaux professionnels ou partenariats utiles" },
    { number: 26, criterionNumber: 7, label: "Recueil des appréciations des parties prenantes" },
    { number: 27, criterionNumber: 7, label: "Traitement des difficultés, réclamations, litiges et abandons" },
    { number: 28, criterionNumber: 7, label: "Mise en œuvre d'un dispositif d'amélioration continue" },
    { number: 29, criterionNumber: 7, label: "Moyens mis à disposition pour recueillir et traiter les retours" },
    { number: 30, criterionNumber: 7, label: "Communication sur les taux de réussite et la satisfaction client" },
    { number: 31, criterionNumber: 7, label: "Enquêtes de satisfaction/suivi auprès des employeurs et bénéficiaires" },
    { number: 32, criterionNumber: 7, label: "Mesure de la valeur ajoutée de la prestation (insertion, certifications...)" },
  ];

  for (const indicator of QUALIOPI_INDICATORS) {
    await prisma.qualiopiIndicator.upsert({
      where: { number: indicator.number },
      update: indicator,
      create: indicator,
    });
  }

  // Starter document library — global templates (organizationId: null) every
  // org sees and can adapt. These are structural skeletons, not vetted legal
  // text — spec §5.8 is explicit that template content is client-authored
  // (a training-sector lawyer), not generated by the developer or an AI.
  const DISCLAIMER =
    "[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]\n\n";

  const STARTER_TEMPLATES: { category: string; title: string; bodyText: string }[] = [
    {
      category: "cgv",
      title: "Conditions générales de vente",
      bodyText:
        DISCLAIMER +
        "CONDITIONS GÉNÉRALES DE VENTE\n\n" +
        "1. Objet — Les présentes conditions régissent les prestations de formation proposées par [NOM DE L'ORGANISME], organisme de formation enregistré sous le numéro [NUMÉRO DE DÉCLARATION D'ACTIVITÉ].\n\n" +
        "2. Inscription — Toute inscription est confirmée par la signature d'une convention ou d'un contrat de formation.\n\n" +
        "3. Tarifs et règlement — Les prix sont indiqués en euros. Modalités de paiement : [À COMPLÉTER].\n\n" +
        "4. Annulation et report — Conditions d'annulation, de report et de remplacement de participant : [À COMPLÉTER].\n\n" +
        "5. Accessibilité — Les personnes en situation de handicap peuvent contacter le référent handicap de l'organisme : [COORDONNÉES].\n\n" +
        "6. Litiges — En cas de litige, les parties s'efforcent de trouver une solution amiable avant tout recours contentieux.",
    },
    {
      category: "internal_rules",
      title: "Règlement intérieur",
      bodyText:
        DISCLAIMER +
        "RÈGLEMENT INTÉRIEUR\n\n" +
        "1. Objet et champ d'application — Le présent règlement s'applique à tous les stagiaires inscrits à une action de formation dispensée par [NOM DE L'ORGANISME].\n\n" +
        "2. Discipline — Horaires, assiduité, tenue et comportement attendus des stagiaires : [À COMPLÉTER].\n\n" +
        "3. Hygiène et sécurité — Consignes applicables sur le lieu de formation : [À COMPLÉTER].\n\n" +
        "4. Sanctions — Procédure disciplinaire applicable en cas de manquement.\n\n" +
        "5. Représentation des stagiaires — Modalités applicables pour les actions de plus de 500 heures, le cas échéant.",
    },
    {
      category: "convention",
      title: "Convention de formation professionnelle",
      bodyText:
        DISCLAIMER +
        "CONVENTION DE FORMATION PROFESSIONNELLE\n" +
        "(article L.6353-1 et suivants du Code du travail)\n\n" +
        "Entre [NOM DE L'ORGANISME], d'une part, et [NOM DU CLIENT / ENTREPRISE], d'autre part.\n\n" +
        "Article 1 — Objet : la présente convention a pour objet la réalisation de l'action de formation suivante : [INTITULÉ DE LA FORMATION].\n\n" +
        "Article 2 — Nature et durée : [DATES, DURÉE, MODALITÉS (présentiel/distanciel)].\n\n" +
        "Article 3 — Effectifs : [NOMBRE DE STAGIAIRES].\n\n" +
        "Article 4 — Dispositions financières : coût total, modalités de règlement, prise en charge éventuelle : [À COMPLÉTER].\n\n" +
        "Article 5 — Sanction de la formation : attestation de fin de formation remise à l'issue de l'action.",
    },
    {
      category: "needs_assessment",
      title: "Recueil des besoins",
      bodyText:
        DISCLAIMER +
        "RECUEIL DES BESOINS\n\n" +
        "Merci de compléter les informations suivantes afin que nous puissions adapter au mieux la formation à votre situation.\n\n" +
        "1. Votre situation actuelle et votre expérience en lien avec la thématique de la formation.\n\n" +
        "2. Vos objectifs et attentes vis-à-vis de cette formation.\n\n" +
        "3. Les difficultés ou contraintes particulières dont l'organisme devrait avoir connaissance (rythme, disponibilités, besoins d'adaptation...).\n\n" +
        "4. Toute autre information utile pour personnaliser votre parcours.",
    },
    {
      category: "convocation",
      title: "Convocation",
      bodyText:
        DISCLAIMER +
        "CONVOCATION\n\n" +
        "Vous êtes convoqué(e) à la session de formation suivante :\n\n" +
        "Intitulé : [TITRE DE LA FORMATION]\nDate(s) : [DATES]\nHoraires : [HORAIRES]\nLieu / lien de connexion : [LIEU OU LIEN VISIO]\nFormateur : [NOM DU FORMATEUR]\n\n" +
        "Merci de vous munir de [DOCUMENTS OU MATÉRIEL À APPORTER, LE CAS ÉCHÉANT].\n\n" +
        "En cas d'empêchement, merci de nous prévenir dans les meilleurs délais.",
    },
    {
      category: "eval_hot",
      title: "Évaluation à chaud",
      bodyText:
        DISCLAIMER +
        "ÉVALUATION À CHAUD\n\n" +
        "À compléter à l'issue de la formation.\n\n" +
        "1. Les objectifs annoncés de la formation ont-ils été atteints ? (Pas du tout / Partiellement / Totalement)\n\n" +
        "2. Qualité des supports et méthodes pédagogiques utilisés.\n\n" +
        "3. Qualité de l'animation par le formateur.\n\n" +
        "4. Organisation logistique (lieu, horaires, matériel).\n\n" +
        "5. Points forts et axes d'amélioration.\n\n" +
        "6. Recommanderiez-vous cette formation ? (Oui / Non / Sans avis)",
    },
    {
      category: "eval_cold",
      title: "Évaluation à froid",
      bodyText:
        DISCLAIMER +
        "ÉVALUATION À FROID\n\n" +
        "À adresser quelques semaines/mois après la fin de la formation.\n\n" +
        "1. Avez-vous pu mettre en pratique les acquis de la formation dans votre activité ?\n\n" +
        "2. Quels changements concrets avez-vous constatés dans votre pratique professionnelle ?\n\n" +
        "3. Quels freins avez-vous rencontrés, le cas échéant, dans la mise en application ?\n\n" +
        "4. Auriez-vous besoin d'un accompagnement complémentaire ?",
    },
  ];

  for (const template of STARTER_TEMPLATES) {
    const existing = await prisma.documentTemplate.findFirst({
      where: { organizationId: null, category: template.category, title: template.title },
    });
    if (!existing) {
      await prisma.documentTemplate.create({ data: { organizationId: null, ...template } });
    }
  }

  console.log(`Reference data seeded: ${QUALIOPI_INDICATORS.length} Qualiopi indicators, ${STARTER_TEMPLATES.length} document templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
