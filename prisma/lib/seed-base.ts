import { PrismaClient, PipelineStage, SessionFormat, Role, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedStarterTemplates } from "./starter-templates";

// Demo-only password, same for every seeded account. Never do this outside
// a local/dev seed script.
const DEMO_PASSWORD = "conforma2026";

// Extracted from the former prisma/seed.ts main() so both the CLI script
// and the protected /api/admin/seed-demo route can run the same logic
// against whichever PrismaClient (and thus whichever database) they hold.
export async function seedBase(prisma: PrismaClient) {
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

  const existingCourse = await prisma.course.findFirst({ where: { organizationId: org.id, title: "Management d'équipe" } });
  const course =
    existingCourse ??
    (await prisma.course.create({
      data: { organizationId: org.id, title: "Management d'équipe" },
    }));

  let session = await prisma.session.findFirst({ where: { courseId: course.id, format: SessionFormat.IN_PERSON } });
  if (!session) {
    session = await prisma.session.create({
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
  }

  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "jean.dupuis@atlas-conseil.fr" } },
    update: {},
    create: {
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

  let dossier = await prisma.dossier.findFirst({ where: { contactId: contact.id, sessionId: session.id } });
  if (!dossier) {
    dossier = await prisma.dossier.create({
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
  }

  const existingInvoice = await prisma.invoice.findFirst({ where: { organizationId: org.id, reference: "FAC-2026-001" } });
  if (!existingInvoice) {
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
  }

  let remoteSession = await prisma.session.findFirst({ where: { courseId: course.id, format: SessionFormat.REMOTE } });
  if (!remoteSession) {
    remoteSession = await prisma.session.create({
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
  }

  const existingRemoteDossier = await prisma.dossier.findFirst({ where: { contactId: contact.id, sessionId: remoteSession.id } });
  if (!existingRemoteDossier) {
    await prisma.dossier.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        sessionId: remoteSession.id,
        needsAssessmentDone: true,
        contractSigned: true,
      },
    });
  }

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

  const existingOpportunity = await prisma.opportunity.findFirst({ where: { organizationId: org.id, contactId: contact.id, label: "Management d'équipe" } });
  if (!existingOpportunity) {
    await prisma.opportunity.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        label: "Management d'équipe",
        stage: PipelineStage.SESSION_SCHEDULED,
        ownerId: admin.id,
      },
    });
  }

  async function upsertEmail(data: Parameters<typeof prisma.emailMessage.create>[0]["data"] & { fromAddress: string; subject: string }) {
    const existing = await prisma.emailMessage.findFirst({ where: { organizationId: org.id, fromAddress: data.fromAddress, subject: data.subject } });
    if (!existing) await prisma.emailMessage.create({ data });
  }
  await upsertEmail({
    organizationId: org.id,
    contactId: null,
    fromAddress: "sophie.durand@nouvelle-entreprise.fr",
    subject: "Demande d'information — formation management",
    snippet: "Bonjour, pourriez-vous m'envoyer le programme et les tarifs de votre formation management d'équipe ?",
    body: "Bonjour,\n\nPourriez-vous m'envoyer le programme et les tarifs de votre formation management d'équipe ? Nous sommes une équipe de 6 personnes intéressées pour une session avant la fin de l'année.\n\nCordialement,\nSophie Durand",
    receivedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    direction: "in",
  });
  await upsertEmail({
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
  });

  const existingDossierProcessing = await prisma.processingActivity.findFirst({ where: { organizationId: org.id, name: "Gestion des dossiers apprenants" } });
  const dossierProcessing =
    existingDossierProcessing ??
    (await prisma.processingActivity.create({
      data: { organizationId: org.id, name: "Gestion des dossiers apprenants", legalBasis: "Exécution du contrat", retentionPeriod: "5 ans", riskFlag: "ok" },
    }));
  const existingAttendanceProcessing = await prisma.processingActivity.findFirst({ where: { organizationId: org.id, name: "Émargement électronique" } });
  const attendanceProcessing =
    existingAttendanceProcessing ??
    (await prisma.processingActivity.create({
      data: { organizationId: org.id, name: "Émargement électronique", legalBasis: "Obligation légale", retentionPeriod: "10 ans", riskFlag: "to_review" },
    }));

  const existingDpia = await prisma.dPIARecord.findFirst({ where: { organizationId: org.id, processingActivityId: attendanceProcessing.id } });
  if (!existingDpia) {
    await prisma.dPIARecord.create({
      data: {
        organizationId: org.id,
        processingActivityId: attendanceProcessing.id,
        subject: "Emargement électronique via prestataire tiers",
        riskLevel: "moderate",
        status: "in_progress",
      },
    });
  }

  const existingSubProcessors = await prisma.subProcessor.count({ where: { organizationId: org.id } });
  if (existingSubProcessors === 0) {
    await prisma.subProcessor.createMany({
      data: [
        { organizationId: org.id, name: "OVHcloud", role: "Hébergement", location: "France", dpaStatus: "signed" },
        { organizationId: org.id, name: "Brevo", role: "Emailing transactionnel", location: "France", dpaStatus: "signed" },
        { organizationId: org.id, name: "Yousign", role: "Signature électronique", location: "France", dpaStatus: "pending" },
      ],
    });
  }

  const existingRightsRequest = await prisma.rightsRequest.findFirst({ where: { organizationId: org.id, personLabel: "Jean Dupuis" } });
  if (!existingRightsRequest) {
    await prisma.rightsRequest.create({
      data: {
        organizationId: org.id,
        requestType: "access",
        personLabel: "Jean Dupuis",
        deadline: new Date(Date.now() + 18 * 24 * 3600 * 1000),
        status: "open",
      },
    });
  }

  const existingDocument = await prisma.document.findFirst({ where: { organizationId: org.id, dossierId: dossier.id, title: "Convention de formation signée" } });
  if (!existingDocument) {
    await prisma.document.create({
      data: {
        organizationId: org.id,
        dossierId: dossier.id,
        title: "Convention de formation signée",
        fileUrl: "https://example.com/documents/convention-jean-dupuis.pdf",
      },
    });
  }

  const existingNonConformity = await prisma.nonConformity.findFirst({ where: { organizationId: org.id, subject: "Programme détaillé manquant avant le démarrage — session du 28/07" } });
  if (!existingNonConformity) {
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
  }

  // Référentiel National Qualité — 7 criteria / 32 indicators, shared
  // reference data (not tenant-scoped). Labels are working summaries for
  // the scaffold; verify wording against the official France Compétences
  // referential before relying on them for an actual audit (see comment on
  // the QualiopiIndicator model in schema.prisma).
  // Corrected against the official RNQ structure — see the identical
  // comment in prisma/seed-reference-data.ts for the full rationale (this
  // array is duplicated here for local demo seeding and must stay in sync).
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
  const existingEvidence = await prisma.qualiopiIndicatorEvidence.count({ where: { organizationId: org.id } });
  if (existingEvidence === 0) {
    await prisma.qualiopiIndicatorEvidence.createMany({
      data: [
        { organizationId: org.id, dossierId: dossier.id, criterionNumber: 3, indicatorNumber: 9, evidenceNote: "Convention signée + convocation" },
        { organizationId: org.id, dossierId: dossier.id, criterionNumber: 3, indicatorNumber: 7, evidenceNote: "Programme envoyé au bénéficiaire" },
        { organizationId: org.id, criterionNumber: 1, indicatorNumber: 1, evidenceNote: "Page catalogue publique" },
        { organizationId: org.id, criterionNumber: 7, indicatorNumber: 27, evidenceNote: "Registre réclamations tenu à jour" },
      ],
    });
  }

  // Starter document library — the same 16 Jalon-authored templates the
  // reference seed installs, shared from one module so the two never drift
  // (see prisma/lib/starter-templates.ts).
  await seedStarterTemplates(prisma);

  const existingElearningModule = await prisma.elearningModule.findFirst({ where: { courseId: course.id, title: "Introduction au management d'équipe" } });
  const elearningModule =
    existingElearningModule ??
    (await prisma.elearningModule.create({
      data: { courseId: course.id, title: "Introduction au management d'équipe" },
    }));
  const existingElearningProgress = await prisma.elearningProgress.findFirst({ where: { dossierId: dossier.id, moduleId: elearningModule.id } });
  if (!existingElearningProgress) {
    await prisma.elearningProgress.create({
      data: { dossierId: dossier.id, moduleId: elearningModule.id, percentComplete: 40, lastEventAt: new Date() },
    });
  }

  return { org, admin, trainer, sales, contact, dossier };
}
