import { PrismaClient, Role, SessionFormat, SessionMode, PipelineStage, DocStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { put } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";

const DEMO_PASSWORD = "conforma2026";
const ORG_ID = "org_demo";

// Committed to the repo (not the local scratchpad) so this file resolves
// identically whether run via `tsx prisma/seed-demo.ts` locally or from
// the packaged /api/admin/seed-demo route on Vercel. process.cwd() rather
// than __dirname — Next's bundler flattens compiled module locations
// (__dirname stops matching the source tree), but process.cwd() stays the
// project root in both tsx and the Vercel serverless function.
const DEMO_ASSETS_DIR = path.join(process.cwd(), "prisma", "demo-assets");

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 3600 * 1000);
}

// A minimal hand-built PDF (no library needed) — real bytes a browser can
// actually open, not a renamed .txt, for the "document" module type and
// the invoice-adjacent paperwork this script seeds.
function escapePdfText(s: string) {
  return s.replace(/([()\\])/g, "\\$1");
}
function buildSimplePdf(title: string, lines: string[]): Buffer {
  const objs: string[] = [];
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
  objs.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n`
  );
  objs.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  let content = `BT /F1 18 Tf 72 720 Td (${escapePdfText(title)}) Tj ET\n`;
  let y = 690;
  for (const line of lines) {
    content += `BT /F1 11 Tf 72 ${y} Td (${escapePdfText(line)}) Tj ET\n`;
    y -= 20;
  }
  objs.push(`5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// Same upload path as src/lib/storage.ts's uploadModuleFile — duplicated
// rather than imported because that helper takes a Web File, not a Buffer.
async function uploadDemoFile(organizationId: string, moduleId: string, filename: string, buffer: Buffer, contentType: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN manquant — impossible d'uploader les fichiers de démo.");
  }
  const pathname = `lms/${organizationId}/${moduleId}/${filename}`;
  const blob = await put(pathname, buffer, { access: "public", addRandomSuffix: true, contentType });
  return { url: blob.url, fileName: filename, sizeBytes: buffer.byteLength };
}

export async function seedDemoData(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ORG_ID } });

  // ============================================================
  // 1. Fill in the missing roles — seedBase already covers
  //    ADMIN_OF, TRAINER, SALES, LEARNER.
  // ============================================================
  const adminManager = await prisma.user.upsert({
    where: { email: "nadia.rahmani@formations-nova.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "nadia.rahmani@formations-nova.fr",
      name: "Nadia Rahmani",
      role: Role.ADMIN_MANAGER,
      passwordHash,
      status: "active",
    },
  });
  const dpo = await prisma.user.upsert({
    where: { email: "isabelle.roche@dpo-externe.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "isabelle.roche@dpo-externe.fr",
      name: "Isabelle Roche",
      role: Role.DPO_EXTERNAL,
      passwordHash,
      status: "active",
    },
  });
  const trainer2 = await prisma.user.upsert({
    where: { email: "thomas.marchand@formations-nova.fr" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "thomas.marchand@formations-nova.fr",
      name: "Thomas Marchand",
      role: Role.TRAINER,
      passwordHash,
      status: "active",
    },
  });

  const marie = await prisma.user.findUniqueOrThrow({ where: { email: "marie@formations-nova.fr" } });
  const claire = await prisma.user.findUniqueOrThrow({ where: { email: "claire.bonnet@formations-nova.fr" } });
  const julien = await prisma.user.findUniqueOrThrow({ where: { email: "julien.petit@formations-nova.fr" } });
  const jeanUser = await prisma.user.findUniqueOrThrow({ where: { email: "jean.dupuis@atlas-conseil.fr" } });
  const jeanContact = await prisma.contact.findFirstOrThrow({ where: { organizationId: org.id, email: "jean.dupuis@atlas-conseil.fr" } });

  // ============================================================
  // 2. Four more learners, each parked at a different point in the
  //    e-learning journey so the LMS tracking is visibly exercised.
  // ============================================================
  async function upsertLearner(email: string, firstName: string, lastName: string, phone: string) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { organizationId: org.id, email, name: `${firstName} ${lastName}`, role: Role.LEARNER, passwordHash, status: "active" },
    });
    const contact = await prisma.contact.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: { firstName, lastName, phone },
      create: { organizationId: org.id, firstName, lastName, email, phone },
    });
    return { user, contact };
  }

  const sophie = await upsertLearner("sophie.martin@clientdemo.fr", "Sophie", "Martin", "0601020304");
  const karim = await upsertLearner("karim.benali@clientdemo.fr", "Karim", "Benali", "0601020305");
  const lea = await upsertLearner("lea.fontaine@clientdemo.fr", "Léa", "Fontaine", "0601020306");
  const marc = await upsertLearner("marc.dubois@clientdemo.fr", "Marc", "Dubois", "0601020307");

  // ============================================================
  // 3. Flagship course: real videos, real quiz, a rolling session —
  //    this is the one to open as a learner to check tracking end to end.
  // ============================================================
  let cyberCourse = await prisma.course.findFirst({ where: { organizationId: org.id, title: "Cybersécurité au quotidien" } });
  if (!cyberCourse) {
    cyberCourse = await prisma.course.create({
      data: {
        organizationId: org.id,
        title: "Cybersécurité au quotidien",
        description: "Sensibilisation aux bonnes pratiques de sécurité informatique — formation en ligne, à son rythme.",
        responsibleUsers: { connect: [{ id: marie.id }] },
      },
    });
  }

  let cyberSession = await prisma.session.findFirst({ where: { courseId: cyberCourse.id, mode: SessionMode.ROLLING } });
  if (!cyberSession) {
    cyberSession = await prisma.session.create({
      data: {
        organizationId: org.id,
        courseId: cyberCourse.id,
        trainerId: claire.id,
        mode: SessionMode.ROLLING,
        startsAt: new Date(),
        endsAt: daysFromNow(365),
        format: SessionFormat.REMOTE,
        capacity: 500,
        status: "VALIDATED",
      },
    });
  }

  async function upsertModule(title: string, type: string, order: number, description: string) {
    let m = await prisma.elearningModule.findFirst({ where: { courseId: cyberCourse!.id, title } });
    if (!m) m = await prisma.elearningModule.create({ data: { courseId: cyberCourse!.id, title, type, order, description } });
    return m;
  }

  const modVideo1 = await upsertModule("Introduction à la cybersécurité", "video", 0, "Les bases : mots de passe, mises à jour, sauvegardes.");
  const modVideo2 = await upsertModule("Reconnaître le phishing", "video", 1, "Identifier un email ou un message frauduleux.");
  const modDoc = await upsertModule("Charte de sécurité informatique", "document", 2, "À lire et conserver.");
  const modQuiz = await upsertModule("Évaluation cybersécurité", "quiz", 3, "Validez vos acquis pour terminer la formation.");

  if (!modVideo1.fileUrl) {
    const buf = fs.readFileSync(path.join(DEMO_ASSETS_DIR, "video1.mp4"));
    const uploaded = await uploadDemoFile(org.id, modVideo1.id, "introduction-cybersecurite.mp4", buf, "video/mp4");
    await prisma.elearningModule.update({ where: { id: modVideo1.id }, data: { fileUrl: uploaded.url, fileName: uploaded.fileName, fileSizeBytes: uploaded.sizeBytes } });
  }
  if (!modVideo2.fileUrl) {
    const buf = fs.readFileSync(path.join(DEMO_ASSETS_DIR, "video2.mp4"));
    const uploaded = await uploadDemoFile(org.id, modVideo2.id, "reconnaitre-le-phishing.mp4", buf, "video/mp4");
    await prisma.elearningModule.update({ where: { id: modVideo2.id }, data: { fileUrl: uploaded.url, fileName: uploaded.fileName, fileSizeBytes: uploaded.sizeBytes } });
  }
  if (!modDoc.fileUrl) {
    const pdfBuf = buildSimplePdf("Charte de securite informatique", [
      "Ce document presente les regles de securite informatique de l'organisme.",
      "",
      "1. Ne jamais communiquer son mot de passe.",
      "2. Verrouiller sa session en cas d'absence.",
      "3. Signaler tout message suspect au service informatique.",
      "4. Mettre a jour ses appareils regulierement.",
      "",
      "Document de demonstration genere pour Jalon.",
    ]);
    const uploaded = await uploadDemoFile(org.id, modDoc.id, "charte-securite-informatique.pdf", pdfBuf, "application/pdf");
    await prisma.elearningModule.update({ where: { id: modDoc.id }, data: { fileUrl: uploaded.url, fileName: uploaded.fileName, fileSizeBytes: uploaded.sizeBytes } });
  }

  let quiz = await prisma.quiz.findFirst({ where: { moduleId: modQuiz.id } });
  if (!quiz) {
    quiz = await prisma.quiz.create({ data: { moduleId: modQuiz.id, minScorePercent: 70, maxAttempts: 3 } });
    await prisma.quizQuestion.createMany({
      data: [
        {
          quizId: quiz.id,
          order: 0,
          type: "single_choice",
          prompt: "Que faire si vous recevez un email suspect vous demandant vos identifiants ?",
          options: [
            { id: "a", text: "Cliquer sur le lien pour vérifier", correct: false },
            { id: "b", text: "Le signaler au service informatique sans cliquer", correct: true },
            { id: "c", text: "Répondre en demandant plus d'informations", correct: false },
          ],
        },
        {
          quizId: quiz.id,
          order: 1,
          type: "true_false",
          prompt: "Il est recommandé d'utiliser le même mot de passe sur plusieurs sites pour s'en souvenir plus facilement.",
          options: [
            { id: "vrai", text: "Vrai", correct: false },
            { id: "faux", text: "Faux", correct: true },
          ],
        },
        {
          quizId: quiz.id,
          order: 2,
          type: "single_choice",
          prompt: "À quelle fréquence faut-il mettre à jour ses appareils ?",
          options: [
            { id: "a", text: "Dès qu'une mise à jour est disponible", correct: true },
            { id: "b", text: "Une fois par an", correct: false },
            { id: "c", text: "Jamais, cela ralentit l'appareil", correct: false },
          ],
        },
      ],
    });
  }
  const quizQuestions = await prisma.quizQuestion.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" } });

  async function enrollRolling(contactId: string, learnerUserId: string, sessionId: string, accessDurationDays: number, firstAccessedAt: Date | null) {
    let d = await prisma.dossier.findFirst({ where: { contactId, sessionId } });
    if (!d) {
      d = await prisma.dossier.create({
        data: {
          organizationId: org.id,
          contactId,
          sessionId,
          learnerUserId,
          needsAssessmentDone: true,
          contractSigned: true,
          convocationSent: false,
          accessDurationDays,
          firstAccessedAt,
        },
      });
    } else {
      d = await prisma.dossier.update({ where: { id: d.id }, data: { accessDurationDays, firstAccessedAt } });
    }
    return d;
  }

  async function setProgress(dossierId: string, moduleId: string, percentComplete: number, lastPositionSeconds?: number) {
    const existing = await prisma.elearningProgress.findFirst({ where: { dossierId, moduleId } });
    if (existing) {
      await prisma.elearningProgress.update({ where: { id: existing.id }, data: { percentComplete, lastPositionSeconds, lastEventAt: new Date() } });
    } else {
      await prisma.elearningProgress.create({
        data: { dossierId, moduleId, percentComplete, lastPositionSeconds, lastEventAt: new Date(), assignedByName: "Démo" },
      });
    }
  }

  // Sophie — enrolled, never opened anything: "Commencer ma formation".
  const dSophie = await enrollRolling(sophie.contact.id, sophie.user.id, cyberSession.id, 30, null);
  await setProgress(dSophie.id, modVideo1.id, 0);

  // Karim — mid-course: "Continuer ma formation", partial progress bar.
  const dKarim = await enrollRolling(karim.contact.id, karim.user.id, cyberSession.id, 30, daysAgo(5));
  await setProgress(dKarim.id, modVideo1.id, 100, 45);
  await setProgress(dKarim.id, modVideo2.id, 40, 18);

  // Léa — finished everything including a passing quiz attempt: "Revoir ma
  // formation" + the "Obtenir mon attestation" button is ready to click live.
  const dLea = await enrollRolling(lea.contact.id, lea.user.id, cyberSession.id, 30, daysAgo(10));
  await setProgress(dLea.id, modVideo1.id, 100, 45);
  await setProgress(dLea.id, modVideo2.id, 100, 38);
  await setProgress(dLea.id, modDoc.id, 100);
  const existingAttempt = await prisma.quizAttempt.findFirst({ where: { quizId: quiz.id, dossierId: dLea.id } });
  if (!existingAttempt) {
    const answers: Record<string, string> = {};
    for (const q of quizQuestions) {
      const opts = q.options as { id: string; text: string; correct: boolean }[];
      const correct = opts.find((o) => o.correct);
      if (correct) answers[q.id] = correct.id;
    }
    await prisma.quizAttempt.create({ data: { quizId: quiz.id, dossierId: dLea.id, answers, scorePercent: 100, passed: true } });
  }
  await setProgress(dLea.id, modQuiz.id, 100);

  // Marc — 14-day access window, started 20 days ago, barely progressed:
  // triggers the "rolling_deadline_overdue" dashboard alert.
  const dMarc = await enrollRolling(marc.contact.id, marc.user.id, cyberSession.id, 14, daysAgo(20));
  await setProgress(dMarc.id, modVideo1.id, 30, 14);

  // Jean Dupuis (existing learner) — 30-day window, 22 days in (73%
  // elapsed): triggers the softer "rolling_deadline_warning" alert instead.
  const dJeanCyber = await enrollRolling(jeanContact.id, jeanUser.id, cyberSession.id, 30, daysAgo(22));
  await setProgress(dJeanCyber.id, modVideo1.id, 100, 45);

  // ============================================================
  // 4. Fixed-date course with two sessions, one still a draft —
  //    shows the "Brouillon · 2 sess." summary on the catalog list.
  // ============================================================
  let fireCourse = await prisma.course.findFirst({ where: { organizationId: org.id, title: "Sécurité incendie" } });
  if (!fireCourse) {
    fireCourse = await prisma.course.create({
      data: { organizationId: org.id, title: "Sécurité incendie", description: "Formation obligatoire aux gestes de premiers secours en cas d'incendie." },
    });
  }
  const fireSessions = await prisma.session.findMany({ where: { courseId: fireCourse.id } });
  let fireSessionDraft = fireSessions.find((s) => s.status === "DRAFT");
  if (!fireSessionDraft) {
    fireSessionDraft = await prisma.session.create({
      data: {
        organizationId: org.id,
        courseId: fireCourse.id,
        trainerId: trainer2.id,
        mode: SessionMode.FIXED_DATE,
        startsAt: daysFromNow(5),
        endsAt: new Date(daysFromNow(5).getTime() + 3 * 3600 * 1000),
        format: SessionFormat.IN_PERSON,
        location: "Salle A · Formations Nova",
        capacity: 10,
        status: "DRAFT",
      },
    });
  }
  if (fireSessions.length < 2) {
    await prisma.session.create({
      data: {
        organizationId: org.id,
        courseId: fireCourse.id,
        trainerId: trainer2.id,
        mode: SessionMode.FIXED_DATE,
        startsAt: daysFromNow(20),
        endsAt: new Date(daysFromNow(20).getTime() + 3 * 3600 * 1000),
        format: SessionFormat.IN_PERSON,
        location: "Salle A · Formations Nova",
        capacity: 10,
        status: "VALIDATED",
      },
    });
  }

  async function enrollFixed(contactId: string, learnerUserId: string, sessionId: string, needsAssessmentDone: boolean, contractSigned: boolean) {
    let d = await prisma.dossier.findFirst({ where: { contactId, sessionId } });
    if (!d) {
      d = await prisma.dossier.create({ data: { organizationId: org.id, contactId, sessionId, learnerUserId, needsAssessmentDone, contractSigned } });
    }
    return d;
  }

  // Sophie has nothing sorted yet, session in 5 days — triggers the
  // "dossier_prep_needs_assessment"/"dossier_prep_contract" alerts.
  await enrollFixed(sophie.contact.id, sophie.user.id, fireSessionDraft.id, false, false);
  await enrollFixed(karim.contact.id, karim.user.id, fireSessionDraft.id, true, true);

  // ============================================================
  // 5. Fixed-date course, full session — shows the "Complet" pill.
  // ============================================================
  let excelCourse = await prisma.course.findFirst({ where: { organizationId: org.id, title: "Excel — niveau 2" } });
  if (!excelCourse) {
    excelCourse = await prisma.course.create({
      data: { organizationId: org.id, title: "Excel — niveau 2", description: "Tableaux croisés dynamiques, macros simples, mise en forme conditionnelle." },
    });
  }
  let excelSession = await prisma.session.findFirst({ where: { courseId: excelCourse.id } });
  if (!excelSession) {
    excelSession = await prisma.session.create({
      data: {
        organizationId: org.id,
        courseId: excelCourse.id,
        trainerId: claire.id,
        mode: SessionMode.FIXED_DATE,
        startsAt: daysFromNow(3),
        endsAt: new Date(daysFromNow(3).getTime() + 6 * 3600 * 1000),
        format: SessionFormat.REMOTE,
        capacity: 2,
        status: "VALIDATED",
      },
    });
  }
  await enrollFixed(lea.contact.id, lea.user.id, excelSession.id, true, true);
  await enrollFixed(marc.contact.id, marc.user.id, excelSession.id, true, true);

  // ============================================================
  // 6. CRM — a spread of prospects across the pipeline.
  // ============================================================
  async function upsertProspectContact(email: string, firstName: string, lastName: string) {
    return prisma.contact.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: {},
      create: { organizationId: org.id, firstName, lastName, email },
    });
  }
  const prospect1 = await upsertProspectContact("celine.roux@nordinfo.fr", "Céline", "Roux");
  const prospect2 = await upsertProspectContact("mehdi.saidi@atelierweb.fr", "Mehdi", "Saidi");
  const prospect3 = await upsertProspectContact("anne.lefort@groupelefort.fr", "Anne", "Lefort");
  const prospect4 = await upsertProspectContact("victor.hugo@editionsvh.fr", "Victor", "Hugo");

  async function upsertOpportunity(contactId: string, label: string, stage: PipelineStage, amountCents: number | null, ownerId: string) {
    const existing = await prisma.opportunity.findFirst({ where: { organizationId: org.id, contactId, label } });
    if (!existing) {
      await prisma.opportunity.create({ data: { organizationId: org.id, contactId, label, stage, amountCents: amountCents ?? undefined, ownerId } });
    }
  }
  await upsertOpportunity(prospect1.id, "Sécurité incendie", PipelineStage.PROSPECT, null, julien.id);
  await upsertOpportunity(prospect2.id, "Cybersécurité au quotidien", PipelineStage.QUOTE_SENT, 90000, julien.id);
  await upsertOpportunity(prospect3.id, "Excel — niveau 2", PipelineStage.CONTRACT_SIGNED, 60000, julien.id);
  await upsertOpportunity(prospect4.id, "Management d'équipe", PipelineStage.TO_INVOICE, 150000, marie.id);
  await upsertOpportunity(sophie.contact.id, "Sécurité incendie", PipelineStage.SESSION_SCHEDULED, 45000, julien.id);

  // ============================================================
  // 7. Inbox — a few more messages: unmatched, matched, RGPD-flagged.
  // ============================================================
  // Checked per-message by (organizationId, fromAddress, subject) rather
  // than a total-count guard — a real connected mailbox can easily have
  // more than a handful of synced messages already, which made a count
  // guard a false positive that silently skipped seeding these (including
  // the one demo message meant to show up under "Suggestions RGPD").
  async function upsertEmailMessage(data: Parameters<typeof prisma.emailMessage.create>[0]["data"] & { fromAddress: string; subject: string }) {
    const existing = await prisma.emailMessage.findFirst({
      where: { organizationId: org.id, fromAddress: data.fromAddress, subject: data.subject },
    });
    if (!existing) await prisma.emailMessage.create({ data });
  }
  await upsertEmailMessage({
    organizationId: org.id,
    contactId: null,
    fromAddress: "mehdi.saidi@atelierweb.fr",
    fromName: "Mehdi Saidi",
    subject: "Devis formation cybersécurité",
    snippet: "Bonjour, merci pour le devis envoyé, nous revenons vers vous sous 48h.",
    body: "Bonjour,\n\nMerci pour le devis envoyé pour la formation cybersécurité. Nous revenons vers vous sous 48h après validation en interne.\n\nCordialement,\nMehdi Saidi",
    receivedAt: daysAgo(1),
    direction: "in",
  });
  await upsertEmailMessage({
    organizationId: org.id,
    contactId: jeanContact.id,
    suggestedDossierId: dJeanCyber.id,
    matchBasis: "thread",
    fromAddress: jeanContact.email,
    subject: "Question sur la formation cybersécurité",
    snippet: "Je n'arrive pas à revoir la première vidéo, un souci ?",
    body: "Bonjour,\n\nJe n'arrive pas à revoir la première vidéo de la formation cybersécurité, un souci technique ? Merci de votre retour.\n\nJean Dupuis",
    receivedAt: daysAgo(2),
    direction: "in",
    assignedToUserId: marie.id,
    assignedToName: marie.name,
  });
  await upsertEmailMessage({
    organizationId: org.id,
    contactId: prospect3.id,
    fromAddress: prospect3.email,
    fromName: "Anne Lefort",
    subject: "Demande d'accès à mes données personnelles",
    snippet: "Je souhaite obtenir une copie de toutes les données que vous détenez à mon sujet.",
    body: "Bonjour,\n\nConformément au RGPD, je souhaite obtenir une copie de toutes les données personnelles que vous détenez à mon sujet.\n\nCordialement,\nAnne Lefort",
    receivedAt: daysAgo(3),
    direction: "in",
    rgpdSuggestedType: "access",
    rgpdClassifiedAt: daysAgo(3),
    rgpdReasoning: "Demande explicite d'accès aux données personnelles (article 15 RGPD).",
  });
  await upsertEmailMessage({
    organizationId: org.id,
    contactId: prospect1.id,
    fromAddress: "contact@formations-nova.fr",
    fromName: "Formations Nova",
    subject: "Re: Sécurité incendie — informations",
    snippet: "Voici le programme détaillé de la formation sécurité incendie.",
    body: "Bonjour Céline,\n\nVoici le programme détaillé de la formation sécurité incendie, ainsi que nos disponibilités pour les prochaines sessions.\n\nCordialement,\nL'équipe Formations Nova",
    receivedAt: daysAgo(1),
    direction: "out",
  });

  // ============================================================
  // 8. Facturation — quotes/invoices spanning several statuses.
  // ============================================================
  async function upsertQuote(contactId: string, reference: string, amountCents: number, status: DocStatus) {
    const existing = await prisma.quote.findFirst({ where: { organizationId: org.id, reference } });
    if (!existing) await prisma.quote.create({ data: { organizationId: org.id, contactId, reference, amountCents, status } });
  }
  await upsertQuote(prospect2.id, "DEV-2026-010", 90000, DocStatus.SENT);
  await upsertQuote(prospect3.id, "DEV-2026-011", 60000, DocStatus.SIGNED);

  async function upsertInvoice(contactId: string, dossierId: string | null, reference: string, amountCents: number, status: DocStatus, fundingOrigin: string) {
    let inv = await prisma.invoice.findFirst({ where: { organizationId: org.id, reference } });
    if (!inv) {
      inv = await prisma.invoice.create({
        data: { organizationId: org.id, contactId, dossierId: dossierId ?? undefined, reference, amountCents, status, fundingOrigin },
      });
    }
    return inv;
  }
  await upsertInvoice(prospect4.id, null, "FAC-2026-020", 150000, DocStatus.OVERDUE, "company");
  const invoicePartial = await upsertInvoice(lea.contact.id, dLea.id, "FAC-2026-021", 60000, DocStatus.SENT, "opco");
  const existingPayment = await prisma.payment.findFirst({ where: { invoiceId: invoicePartial.id } });
  if (!existingPayment) {
    await prisma.payment.create({
      data: { organizationId: org.id, invoiceId: invoicePartial.id, amountCents: 30000, paidAt: daysAgo(4), method: "virement", recordedByName: marie.name },
    });
  }

  // ============================================================
  // 9. Support — a complaint and an anonymous secure report.
  // ============================================================
  const existingComplaint = await prisma.complaint.findFirst({ where: { organizationId: org.id, subject: "Difficulté à accéder à la vidéo du module 1" } });
  if (!existingComplaint) {
    await prisma.complaint.create({
      data: {
        organizationId: org.id,
        dossierId: dJeanCyber.id,
        subject: "Difficulté à accéder à la vidéo du module 1",
        description: "La vidéo d'introduction ne se charge pas correctement depuis mon poste de travail.",
        submittedByName: "Jean Dupuis",
        status: "investigating",
      },
    });
  }
  const existingReport = await prisma.secureReport.findFirst({ where: { organizationId: org.id, description: { contains: "démonstration" } } });
  if (!existingReport) {
    await prisma.secureReport.create({
      data: {
        organizationId: org.id,
        reporterName: null,
        reporterContact: null,
        description: "Signalement anonyme de démonstration — à traiter uniquement par les administrateurs habilités.",
        status: "received",
      },
    });
  }

  // ============================================================
  // 10. Subcontractor with a qualification expiring soon (alert).
  // ============================================================
  const existingSub = await prisma.subcontractor.findFirst({ where: { organizationId: org.id, name: "Marc Antoine — Formateur incendie" } });
  if (!existingSub) {
    await prisma.subcontractor.create({
      data: {
        organizationId: org.id,
        name: "Marc Antoine — Formateur incendie",
        type: "formateur_externe",
        contactEmail: "marc.antoine@formateur-independant.fr",
        qualifications: "Certification SSIAP niveau 2, habilitation formateur premiers secours.",
        contractStartDate: daysAgo(200),
        contractEndDate: daysFromNow(200),
        qualificationExpiryDate: daysFromNow(20),
        status: "active",
      },
    });
  }

  // ============================================================
  // 11. RGPD — a second rights request, this one overdue.
  // ============================================================
  const existingOverdueRequest = await prisma.rightsRequest.findFirst({ where: { organizationId: org.id, personLabel: "Anne Lefort" } });
  if (!existingOverdueRequest) {
    await prisma.rightsRequest.create({
      data: { organizationId: org.id, requestType: "access", personLabel: "Anne Lefort", deadline: daysAgo(2), status: "open" },
    });
  }

  // ============================================================
  // 12. Accessibility — an accommodation request tied to a dossier.
  // ============================================================
  const existingAccommodation = await prisma.accommodationRequest.findFirst({ where: { organizationId: org.id, dossierId: dMarc.id } });
  if (!existingAccommodation) {
    await prisma.accommodationRequest.create({
      data: {
        organizationId: org.id,
        dossierId: dMarc.id,
        description: "Apprenant malvoyant — besoin d'un contraste renforcé et de sous-titres sur les vidéos.",
        requestedAccommodations: "Sous-titrage des vidéos, support de cours en gros caractères.",
        status: "pending",
        createdByName: "Marc Dubois",
      },
    });
  }

  // ============================================================
  // 13. Qualiopi extras — a risk, a result indicator, a watch item.
  // ============================================================
  const existingRisk = await prisma.qualityRisk.findFirst({ where: { organizationId: org.id, risk: "Dépendance à un seul formateur premiers secours" } });
  if (!existingRisk) {
    await prisma.qualityRisk.create({
      data: {
        organizationId: org.id,
        courseId: fireCourse.id,
        risk: "Dépendance à un seul formateur premiers secours",
        origin: "audit",
        probability: "moyenne",
        severity: "elevee",
        ownerName: marie.name,
        preventiveMeasure: "Identifier et former un second intervenant qualifié SSIAP.",
        status: "en_cours",
      },
    });
  }

  const existingIndicator = await prisma.resultIndicator.findFirst({ where: { organizationId: org.id, courseId: cyberCourse.id } });
  if (!existingIndicator) {
    await prisma.resultIndicator.create({
      data: {
        organizationId: org.id,
        courseId: cyberCourse.id,
        label: "Taux de complétion — Cybersécurité au quotidien",
        definition: "Part des apprenants ayant terminé l'ensemble des modules et validé le quiz.",
        formula: "Nombre d'apprenants ayant 100% de progression / nombre d'apprenants inscrits",
        computedFrom: "elearning_completion",
        periodStart: daysAgo(30),
        periodEnd: new Date(),
        totalPopulation: 5,
        respondents: 5,
        computedValue: 20,
        published: true,
      },
    });
  }

  const existingWatch = await prisma.regulatoryWatch.findFirst({ where: { organizationId: org.id, summary: { contains: "Cybermalveillance" } } });
  if (!existingWatch) {
    await prisma.regulatoryWatch.create({
      data: {
        organizationId: org.id,
        watchType: "pedagogique_technologique",
        source: "cybermalveillance.gouv.fr",
        watchDate: daysAgo(10),
        summary: "Nouveau kit de sensibilisation Cybermalveillance.gouv.fr pour les TPE/PME — supports réutilisables pour le module phishing.",
        ownerName: marie.name,
        decision: "Intégrer certains visuels au module « Reconnaître le phishing ».",
        status: "decided",
        createdByName: marie.name,
      },
    });
  }

  return {
    password: DEMO_PASSWORD,
    accounts: [
      { role: "ADMIN_OF", email: "marie@formations-nova.fr" },
      { role: "ADMIN_MANAGER", email: "nadia.rahmani@formations-nova.fr" },
      { role: "SALES", email: "julien.petit@formations-nova.fr" },
      { role: "TRAINER", email: "claire.bonnet@formations-nova.fr" },
      { role: "TRAINER", email: "thomas.marchand@formations-nova.fr" },
      { role: "DPO_EXTERNAL", email: "isabelle.roche@dpo-externe.fr" },
      { role: "LEARNER", email: "jean.dupuis@atlas-conseil.fr", note: "formation en continu, en retard" },
      { role: "LEARNER", email: "sophie.martin@clientdemo.fr", note: "rien commencé" },
      { role: "LEARNER", email: "karim.benali@clientdemo.fr", note: "formation en cours" },
      { role: "LEARNER", email: "lea.fontaine@clientdemo.fr", note: "formation terminée, attestation prête" },
      { role: "LEARNER", email: "marc.dubois@clientdemo.fr", note: "délai dépassé, alerte visible" },
    ],
  };
}
