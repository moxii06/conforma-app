import { PrismaClient, PipelineStage, SessionFormat, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo-only password, same for every seeded account. Never do this outside
// a local/dev seed script.
const DEMO_PASSWORD = "conforma2026";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const org = await prisma.organization.upsert({
    where: { id: "org_demo" },
    update: { nextAuditDate: new Date(Date.now() + 90 * 24 * 3600 * 1000) },
    create: {
      id: "org_demo",
      name: "Formations Nova",
      nextAuditDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    },
  });

  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      plan: "team",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 9 * 24 * 3600 * 1000),
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "marie@formations-nova.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "marie@formations-nova.fr",
      name: "Marie Lefèvre",
      role: Role.ADMIN_OF,
      passwordHash,
    },
  });

  const trainer = await prisma.user.upsert({
    where: { email: "claire.bonnet@formations-nova.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "claire.bonnet@formations-nova.fr",
      name: "Claire Bonnet",
      role: Role.TRAINER,
      passwordHash,
    },
  });

  const course = await prisma.course.create({
    data: { organizationId: org.id, title: "Management d'équipe" },
  });

  const session = await prisma.session.create({
    data: {
      organizationId: org.id,
      courseId: course.id,
      trainerId: trainer.id,
      startsAt: new Date(Date.now() + 4 * 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 4 * 24 * 3600 * 1000 + 3 * 3600 * 1000),
      format: SessionFormat.IN_PERSON,
      location: "Salle B · Formations Nova",
      capacity: 5,
    },
  });

  const contact = await prisma.contact.create({
    data: {
      organizationId: org.id,
      firstName: "Jean",
      lastName: "Dupuis",
      email: "jean.dupuis@atlas-conseil.fr",
    },
  });

  // Learner portal access is a separate account from the Contact record —
  // same person, but Contact is the CRM-side record and User/Role.LEARNER
  // is what actually signs in. Matches Dossier.learnerUserId's doc comment
  // ("set once the learner has portal access").
  const learner = await prisma.user.upsert({
    where: { email: "jean.dupuis@atlas-conseil.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "jean.dupuis@atlas-conseil.fr",
      name: "Jean Dupuis",
      role: Role.LEARNER,
      passwordHash,
    },
  });

  const dossier = await prisma.dossier.create({
    data: {
      organizationId: org.id,
      contactId: contact.id,
      sessionId: session.id,
      learnerUserId: learner.id,
      needsAssessmentDone: true,
      contractSigned: true,
      convocationSent: true,
      evaluationHotDone: false,
      evaluationColdDone: false,
      learnerCategory: "employee",
    },
  });

  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      contactId: contact.id,
      dossierId: dossier.id,
      reference: "FAC-2026-001",
      amountCents: 120000,
      status: "PAID",
      fundingOrigin: "opco",
      einvoicingProvider: "ppf",
    },
  });

  const remoteSession = await prisma.session.create({
    data: {
      organizationId: org.id,
      courseId: course.id,
      trainerId: trainer.id,
      startsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000 + 2 * 3600 * 1000),
      format: SessionFormat.REMOTE,
      capacity: 8,
    },
  });

  await prisma.dossier.create({
    data: {
      organizationId: org.id,
      contactId: contact.id,
      sessionId: remoteSession.id,
      needsAssessmentDone: true,
      contractSigned: true,
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: "julien.petit@formations-nova.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "julien.petit@formations-nova.fr",
      name: "Julien Petit",
      role: Role.SALES,
      passwordHash,
    },
  });

  await prisma.opportunity.createMany({
    data: [
      {
        organizationId: org.id,
        contactId: contact.id,
        label: "Management d'équipe",
        stage: PipelineStage.SESSION_SCHEDULED,
        ownerId: admin.id,
      },
    ],
  });

  await prisma.emailMessage.createMany({
    data: [
      {
        organizationId: org.id,
        contactId: null,
        fromAddress: "sophie.durand@nouvelle-entreprise.fr",
        subject: "Demande d'information — formation management",
        snippet: "Bonjour, pourriez-vous m'envoyer le programme et les tarifs de votre formation management d'équipe ?",
        body: "Bonjour,\n\nPourriez-vous m'envoyer le programme et les tarifs de votre formation management d'équipe ? Nous sommes une équipe de 6 personnes intéressées pour une session avant la fin de l'année.\n\nCordialement,\nSophie Durand",
        receivedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        direction: "in",
      },
      {
        organizationId: org.id,
        contactId: contact.id,
        suggestedDossierId: dossier.id,
        matchBasis: "thread",
        fromAddress: contact.email,
        subject: "Re: Convocation — session du 24/07",
        snippet: "Merci pour la convocation, je confirme ma présence.",
        body: "Bonjour,\n\nMerci pour la convocation, je confirme ma présence à la session du 24/07. Pouvez-vous me confirmer l'adresse exacte ?\n\nCordialement",
        receivedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
        direction: "in",
      },
    ],
  });

  const [dossierProcessing, attendanceProcessing] = await Promise.all([
    prisma.processingActivity.create({
      data: { organizationId: org.id, name: "Gestion des dossiers apprenants", legalBasis: "Exécution du contrat", retentionPeriod: "5 ans", riskFlag: "ok" },
    }),
    prisma.processingActivity.create({
      data: { organizationId: org.id, name: "Émargement électronique", legalBasis: "Obligation légale", retentionPeriod: "10 ans", riskFlag: "to_review" },
    }),
  ]);

  await prisma.dPIARecord.create({
    data: {
      organizationId: org.id,
      processingActivityId: attendanceProcessing.id,
      subject: "Emargement électronique via prestataire tiers",
      riskLevel: "moderate",
      status: "in_progress",
    },
  });

  await prisma.subProcessor.createMany({
    data: [
      { organizationId: org.id, name: "OVHcloud", role: "Hébergement", location: "France", dpaStatus: "signed" },
      { organizationId: org.id, name: "Brevo", role: "Emailing transactionnel", location: "France", dpaStatus: "signed" },
      { organizationId: org.id, name: "Yousign", role: "Signature électronique", location: "France", dpaStatus: "pending" },
    ],
  });

  await prisma.rightsRequest.create({
    data: {
      organizationId: org.id,
      requestType: "access",
      personLabel: "Jean Dupuis",
      deadline: new Date(Date.now() + 18 * 24 * 3600 * 1000),
      status: "open",
    },
  });

  await prisma.document.create({
    data: {
      organizationId: org.id,
      dossierId: dossier.id,
      title: "Convention de formation signée",
      fileUrl: "https://example.com/documents/convention-jean-dupuis.pdf",
    },
  });

  await prisma.nonConformity.create({
    data: {
      organizationId: org.id,
      type: "non_conformity",
      subject: "Programme détaillé manquant avant le démarrage — session du 28/07",
      origin: "Auto-détecté (contrôle interne)",
      status: "in_progress",
      dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    },
  });

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

  // A little evidence coverage so the Indicators tab shows a non-zero score.
  await prisma.qualiopiIndicatorEvidence.createMany({
    data: [
      { organizationId: org.id, dossierId: dossier.id, criterionNumber: 3, indicatorNumber: 9, evidenceNote: "Convention signée + convocation" },
      { organizationId: org.id, dossierId: dossier.id, criterionNumber: 3, indicatorNumber: 7, evidenceNote: "Programme envoyé au bénéficiaire" },
      { organizationId: org.id, criterionNumber: 1, indicatorNumber: 1, evidenceNote: "Page catalogue publique" },
      { organizationId: org.id, criterionNumber: 7, indicatorNumber: 27, evidenceNote: "Registre réclamations tenu à jour" },
    ],
  });

  // Starter document library — global templates (organizationId: null) every
  // org sees and can adapt. These are structural skeletons, not vetted legal
  // text — spec §5.8 is explicit that template content is client-authored
  // (a training-sector lawyer), not generated by the developer or an AI.
  // Flag clearly for the org to have their own template reviewed before use.
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
  ];

  for (const template of STARTER_TEMPLATES) {
    const existing = await prisma.documentTemplate.findFirst({
      where: { organizationId: null, category: template.category, title: template.title },
    });
    if (!existing) {
      await prisma.documentTemplate.create({ data: { organizationId: null, ...template } });
    }
  }

  const elearningModule = await prisma.elearningModule.create({
    data: { courseId: course.id, title: "Introduction au management d'équipe" },
  });
  await prisma.elearningProgress.create({
    data: { dossierId: dossier.id, moduleId: elearningModule.id, percentComplete: 40, lastEventAt: new Date() },
  });

  console.log("Seed complete:", { org: org.id, admin: admin.email, dossierProcessing: dossierProcessing.id });
  console.log(`Login with any seeded user email above and password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
