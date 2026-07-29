import { PrismaClient, Prisma } from "@prisma/client";

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

  // Starter document library — global templates (organizationId: null) every
  // org sees and can adapt. These are structural skeletons, not vetted legal
  // text — spec §5.8 is explicit that template content is client-authored
  // (a training-sector lawyer), not generated by the developer or an AI.
  const DISCLAIMER =
    "[Modèle de démarrage — à faire relire et valider par un juriste avant tout usage réel.]\n\n";

  type StarterBlock = { bodyText: string; conditions: { questionKey: string; in: string[] }[] | null };
  const STARTER_TEMPLATES: { category: string; title: string; bodyText: string; blocks?: StarterBlock[] }[] = [
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
        "6. Litiges — En cas de litige, les parties s'efforcent de trouver une solution amiable avant tout recours contentieux. Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, si le client est un consommateur et qu'aucune solution amiable n'a pu être trouvée, il peut recourir gratuitement au service de médiation de la consommation suivant, dans un délai d'un an à compter de sa réclamation écrite auprès de l'organisme : [NOM ET COORDONNÉES DU MÉDIATEUR DE LA CONSOMMATION — voir mediation-conso.fr pour la liste des médiateurs agréés].",
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
      category: "contrat_formation",
      title: "Contrat de formation professionnelle (particulier) — paragraphes conditionnels",
      bodyText: DISCLAIMER + "Modèle assemblé automatiquement à partir des paragraphes ci-dessous — voir l'onglet Modèles, Bibliothèque.",
      blocks: [
        {
          bodyText:
            "CONTRAT DE FORMATION PROFESSIONNELLE\n(articles L.6353-3 et suivants du Code du travail — personne physique s'inscrivant à titre individuel et à ses frais)\n\nEntre {{organization.name}}, organisme de formation enregistré sous le numéro de déclaration d'activité {{organization.activityDeclarationNumber}}, d'une part, et {{contact.firstName}} {{contact.lastName}}, d'autre part.\n\nArticle 1 — Objet : le présent contrat a pour objet la réalisation de l'action de formation suivante : {{course.title}}.\n\nArticle 2 — Nature et durée : {{session.startsAt}} — {{course.duration}}.",
          conditions: null,
        },
        {
          bodyText:
            "Article 3 — Programme et objectifs pédagogiques : se reporter au programme détaillé remis au stagiaire avant son inscription (objectifs, prérequis, méthodes et modalités d'évaluation).",
          conditions: null,
        },
        {
          bodyText: "Article 4 — Lieu de la formation : {{session.location}}.",
          conditions: [{ questionKey: "modalite", in: ["IN_PERSON", "HYBRID"] }],
        },
        {
          bodyText:
            "Article 4 bis — Modalités à distance : la formation (ou une partie de celle-ci) est dispensée à distance, via [NOM DE LA PLATEFORME]. Le stagiaire dispose des accès nécessaires (identifiants, prérequis techniques) communiqués avant le début de l'action. [À VALIDER PAR UN JURISTE : engagement d'assistance technique et pédagogique à distance, art. L.6353-1.]",
          conditions: [{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }],
        },
        {
          bodyText:
            "Article 5 — Prise en charge par un tiers financeur : tout ou partie du coût de la formation est réglé directement par {{funder.name}} par subrogation. Le stagiaire s'engage à fournir à l'organisme les justificatifs nécessaires à cette prise en charge. [À VALIDER PAR UN JURISTE : conséquences en cas de refus ou de retrait de la prise en charge.]",
          conditions: [{ questionKey: "subrogation", in: ["oui"] }],
        },
        {
          bodyText:
            "Article 6 — Prix et modalités de règlement : le prix de la formation, déduction faite de toute prise en charge par un tiers financeur, s'élève à {{funding.remainder}} TTC, payable selon les modalités suivantes : [À COMPLÉTER — comptant / échéancier].",
          conditions: [{ questionKey: "resteACharge", in: ["oui"] }],
        },
        {
          bodyText:
            "Article 7 — Délai de rétractation : à compter de la signature du présent contrat, le stagiaire a un délai de dix jours pour se rétracter. Il en informe l'organisme par lettre recommandée avec accusé de réception. Aucune somme ne peut être exigée du stagiaire avant l'expiration de ce délai. [À VALIDER PAR UN JURISTE : articulation avec un premier paiement déjà perçu, articles L.6353-3 à L.6353-9.]",
          conditions: null,
        },
        {
          bodyText:
            "Article 8 — Sanction de la formation : une attestation de fin de formation est remise au stagiaire à l'issue de l'action, mentionnant les objectifs, la nature et la durée de l'action ainsi que les résultats de l'évaluation des acquis.\n\nArticle 9 — Litiges : en cas de litige, les parties s'efforcent de trouver une solution amiable avant tout recours contentieux. Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, le stagiaire peut recourir gratuitement au service de médiation de la consommation suivant : [NOM ET COORDONNÉES DU MÉDIATEUR — voir mediation-conso.fr].",
          conditions: null,
        },
      ],
    },
    {
      category: "convention",
      title: "Convention de formation professionnelle — paragraphes conditionnels",
      bodyText: DISCLAIMER + "Modèle assemblé automatiquement à partir des paragraphes ci-dessous — voir l'onglet Modèles, Bibliothèque.",
      blocks: [
        {
          bodyText:
            "CONVENTION DE FORMATION PROFESSIONNELLE\n(article L.6353-1 et suivants du Code du travail)\n\nEntre {{organization.name}}, organisme de formation enregistré sous le numéro de déclaration d'activité {{organization.activityDeclarationNumber}}, d'une part, et {{company.name}}, d'autre part.\n\nArticle 1 — Objet : la présente convention a pour objet la réalisation de l'action de formation suivante : {{course.title}}, au bénéfice de {{contact.firstName}} {{contact.lastName}}.\n\nArticle 2 — Nature et durée : {{session.startsAt}} — {{course.duration}}.\n\nArticle 3 — Effectifs : [NOMBRE DE STAGIAIRES].",
          conditions: null,
        },
        {
          bodyText: "Article 4 — Lieu de la formation : {{session.location}}.",
          conditions: [{ questionKey: "modalite", in: ["IN_PERSON", "HYBRID"] }],
        },
        {
          bodyText:
            "Article 4 bis — Modalités à distance : la formation (ou une partie de celle-ci) est dispensée à distance, via [NOM DE LA PLATEFORME]. [À VALIDER PAR UN JURISTE : engagement d'assistance technique et pédagogique à distance.]",
          conditions: [{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }],
        },
        {
          bodyText:
            "Article 5 — Règlement par subrogation : le coût de la formation est réglé directement à l'organisme par {{funder.name}}, par subrogation, sur présentation des justificatifs de réalisation de l'action. [À VALIDER PAR UN JURISTE.]",
          conditions: [{ questionKey: "subrogation", in: ["oui"] }],
        },
        {
          bodyText: "Article 5 — Règlement : le coût de la formation est réglé directement par {{company.name}}.",
          conditions: [{ questionKey: "subrogation", in: ["non"] }],
        },
        {
          bodyText:
            "Article 6 — Reste à charge : après prise en charge partielle par le financeur, le solde restant dû par le client s'élève à {{funding.remainder}} TTC, payable selon les modalités suivantes : [À COMPLÉTER].",
          conditions: [{ questionKey: "resteACharge", in: ["oui"] }],
        },
        {
          bodyText:
            "Article 7 — Sanction de la formation : une attestation de fin de formation est remise à chaque stagiaire à l'issue de l'action.\n\nArticle 8 — Inexécution : en cas de résiliation par l'une des parties avant le début de la formation, ou en cas d'abandon en cours de formation, se référer aux conditions générales de vente de l'organisme.",
          conditions: null,
        },
      ],
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
    {
      category: "welcome_booklet",
      title: "Livret d'accueil",
      bodyText:
        DISCLAIMER +
        "LIVRET D'ACCUEIL\n\n" +
        "Bienvenue chez [NOM DE L'ORGANISME].\n\n" +
        "1. Présentation de l'organisme — activité, valeurs, équipe : [À COMPLÉTER].\n\n" +
        "2. Vos interlocuteurs — référent pédagogique, référent handicap, contact administratif : [COORDONNÉES].\n\n" +
        "3. Modalités pratiques — horaires, accès aux locaux ou à la plateforme à distance, matériel nécessaire : [À COMPLÉTER].\n\n" +
        "4. Règlement intérieur — se référer au document dédié remis séparément.\n\n" +
        "5. Accessibilité — les personnes en situation de handicap peuvent contacter le référent handicap : [COORDONNÉES].\n\n" +
        "6. Modalités d'évaluation et de suivi — évaluations à chaud/à froid, suivi de la progression e-learning le cas échéant.\n\n" +
        "7. Réclamations — comment signaler une difficulté ou déposer une réclamation : [PROCÉDURE].",
    },
    {
      category: "attendance_sheet",
      title: "Feuille d'émargement",
      bodyText:
        DISCLAIMER +
        "FEUILLE D'ÉMARGEMENT\n\n" +
        "Formation : [TITRE DE LA FORMATION]\n" +
        "Date : [DATE]\n" +
        "Horaires : [HORAIRES]\n" +
        "Formateur : [NOM DU FORMATEUR]\n" +
        "Lieu / modalité : [LIEU OU « À DISTANCE »]\n\n" +
        "Pour une session à distance, l'émargement électronique réel est disponible depuis la fiche de session " +
        "(classe virtuelle) une fois la présence enregistrée par connexion effective des participants.\n\n" +
        "Nom / Prénom | Matin (arrivée/départ) | Après-midi (arrivée/départ) | Signature\n" +
        "[À COMPLÉTER EN PRÉSENTIEL]",
    },
    {
      category: "interim_report",
      title: "Bilan intermédiaire",
      bodyText:
        DISCLAIMER +
        "BILAN INTERMÉDIAIRE\n\n" +
        "Formation : [TITRE DE LA FORMATION]\n" +
        "Période couverte : [DATES]\n\n" +
        "1. Progression par rapport aux objectifs initiaux : [À COMPLÉTER].\n\n" +
        "2. Modules ou compétences déjà validés.\n\n" +
        "3. Points de vigilance ou difficultés identifiées à date.\n\n" +
        "4. Ajustements envisagés pour la suite du parcours, le cas échéant (individualisation).\n\n" +
        "5. Prochaine échéance de suivi : [DATE].",
    },
    {
      category: "final_report",
      title: "Bilan final",
      bodyText:
        DISCLAIMER +
        "BILAN FINAL\n\n" +
        "Formation : [TITRE DE LA FORMATION]\n" +
        "Période : [DATES DE DÉBUT ET DE FIN]\n\n" +
        "1. Objectifs initiaux de la formation : [RAPPEL].\n\n" +
        "2. Atteinte des objectifs — synthèse des résultats obtenus.\n\n" +
        "3. Assiduité — taux de présence sur l'ensemble du parcours.\n\n" +
        "4. Évaluation finale des acquis — résultats, le cas échéant note ou validation de compétences.\n\n" +
        "5. Recommandations et suites possibles (formation complémentaire, mise en pratique...).",
    },
    {
      category: "results_summary",
      title: "Relevé de résultats",
      bodyText:
        DISCLAIMER +
        "RELEVÉ DE RÉSULTATS\n\n" +
        "Bénéficiaire : [NOM ET PRÉNOM]\n" +
        "Formation : [TITRE DE LA FORMATION]\n" +
        "Période : [DATES]\n\n" +
        "Épreuve / module | Résultat obtenu | Seuil de réussite | Validé\n" +
        "[À COMPLÉTER — une ligne par module ou évaluation]\n\n" +
        "Résultat global : [À COMPLÉTER]\n\n" +
        "Fait à [VILLE], le [DATE].\n" +
        "Signature du responsable pédagogique : [SIGNATURE]",
    },
    {
      category: "subcontractor_contract",
      title: "Contrat sous-traitant / intervenant",
      bodyText:
        DISCLAIMER +
        "CONTRAT DE SOUS-TRAITANCE / PRESTATION PÉDAGOGIQUE\n\n" +
        "Entre [NOM DE L'ORGANISME], d'une part, et [NOM DU PRESTATAIRE / INTERVENANT], d'autre part.\n\n" +
        "Article 1 — Objet : le présent contrat a pour objet la réalisation, pour le compte de l'organisme, de tout ou partie de la prestation de formation suivante : [INTITULÉ DE LA FORMATION / MISSION].\n\n" +
        "Article 2 — Durée : [DATE DE DÉBUT] au [DATE DE FIN, le cas échéant].\n\n" +
        "Article 3 — Obligations du prestataire : qualifications et moyens mobilisés, respect du programme et des modalités pédagogiques définis par l'organisme : [À COMPLÉTER].\n\n" +
        "Article 4 — Engagement de conformité au Référentiel National Qualité (RNQ) — indicateur 27 : le prestataire s'engage à exercer sa mission dans le respect des exigences du RNQ applicables à la prestation sous-traitée (information du public, adaptation aux publics, évaluation des acquis, accessibilité aux personnes en situation de handicap notamment), et à fournir à l'organisme, sur demande, tout justificatif permettant d'en attester dans le cadre d'un audit de certification.\n\n" +
        "Article 5 — Rémunération et modalités de règlement : [À COMPLÉTER].\n\n" +
        "Article 6 — Confidentialité : le prestataire s'engage à ne pas divulguer les informations dont il aurait connaissance dans le cadre de sa mission, notamment les données personnelles des bénéficiaires.\n\n" +
        "Article 7 — Résiliation : conditions de résiliation anticipée du présent contrat par l'une ou l'autre des parties : [À COMPLÉTER].",
    },
    {
      category: "handicap_partners",
      title: "Répertoire des partenaires handicap",
      bodyText:
        DISCLAIMER +
        "RÉPERTOIRE DES PARTENAIRES HANDICAP\n\n" +
        "Réseau national d'acteurs mobilisables pour l'accueil, l'accompagnement et le maintien en formation des " +
        "personnes en situation de handicap — à compléter avec vos contacts locaux et à tenir à disposition de " +
        "votre référent handicap et de vos équipes (Qualiopi indicateur 26).\n\n" +
        "AGEFIPH (Association de gestion du fonds pour l'insertion professionnelle des personnes handicapées) — " +
        "financements et appuis pour l'emploi et la formation en milieu ordinaire (secteur privé). agefiph.fr\n\n" +
        "FIPHFP (Fonds pour l'insertion des personnes handicapées dans la fonction publique) — équivalent Agefiph " +
        "pour le secteur public. fiphfp.fr\n\n" +
        "Cap emploi — réseau d'accompagnement vers et dans l'emploi des personnes handicapées, présent dans " +
        "chaque département. Cap emploi le plus proche : [À COMPLÉTER].\n\n" +
        "MDPH (Maison départementale des personnes handicapées) — reconnaissance des droits (RQTH notamment) et " +
        "orientation. MDPH du département : [À COMPLÉTER — coordonnées locales].\n\n" +
        "Pôle emploi / France Travail — référents handicap dédiés dans chaque agence pour l'accompagnement des " +
        "demandeurs d'emploi en situation de handicap.\n\n" +
        "Réseau Cheops (Coordination handicap et emploi des organismes de placement spécialisés) — fédère les " +
        "Cap emploi au niveau national. cheops-ops.org\n\n" +
        "Contact interne de l'organisme : le référent handicap désigné (voir fiche équipe) est le premier point " +
        "d'entrée pour toute demande d'aménagement, avant orientation vers l'un de ces partenaires si nécessaire.",
    },
  ];

  // Upsert-by-title rather than create-only: these are Jalon's own authored
  // rows (organizationId: null), never customer-edited (an org customizes
  // its own fork instead — see ForkTemplateButton), so improving the
  // wording here should reach every org's library view on the next seed
  // run instead of requiring a one-off manual DB fix.
  for (const template of STARTER_TEMPLATES) {
    const { blocks, ...templateData } = template;
    const existing = await prisma.documentTemplate.findFirst({
      where: { organizationId: null, category: template.category, title: template.title },
    });
    const row = existing
      ? await prisma.documentTemplate.update({ where: { id: existing.id }, data: templateData })
      : await prisma.documentTemplate.create({ data: { organizationId: null, ...templateData } });
    if (blocks) {
      await prisma.documentTemplateBlock.deleteMany({ where: { templateId: row.id } });
      if (blocks.length > 0) {
        await prisma.documentTemplateBlock.createMany({
          data: blocks.map((b, i) => ({ templateId: row.id, order: i, bodyText: b.bodyText, conditions: b.conditions ?? Prisma.JsonNull })),
        });
      }
    }
  }

  console.log(
    `Reference data seeded: ${QUALIOPI_INDICATORS.length} Qualiopi indicators (RNQ 2022) + ${REFORME_2026_INDICATORS.length} (réforme 2026, projet), ${STARTER_TEMPLATES.length} document templates.`
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
