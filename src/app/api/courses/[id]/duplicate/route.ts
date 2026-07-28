import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Copies the structural/template side of a course (fields, modules,
// chapters, quizzes, course-scoped document templates, automation rules,
// satisfaction survey question sets) so staff can start a new offer from a
// known-good one instead of rebuilding it module by module. Deliberately
// excludes anything tied to the ORIGINAL course's live history: isPublic
// resets to false (an unreviewed copy shouldn't silently go live),
// archivedAt resets to null, and sessions/enrolled learners/opportunities/
// quality risks/result indicators/regulatory watch items/survey responses
// are never copied — they belong to what actually happened under the
// original course, not to a fresh copy with no activity yet.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const original = await prisma.course.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      responsibleUsers: { select: { id: true } },
      subcontractors: { select: { id: true } },
      chapters: { orderBy: { createdAt: "asc" } },
      elearningModules: {
        orderBy: { order: "asc" },
        include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } }, attachments: true },
      },
      documentTemplates: true,
      automationRules: true,
      satisfactionSurveys: { include: { questions: { orderBy: { order: "asc" } } } },
    },
  });
  if (!original) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const duplicate = await prisma.$transaction(async (tx) => {
    const newCourse = await tx.course.create({
      data: {
        organizationId: session.organizationId,
        title: `${original.title} (copie)`,
        description: original.description,
        durationHours: original.durationHours,
        priceCents: original.priceCents,
        certificateValidityMonths: original.certificateValidityMonths,
        prerequisites: original.prerequisites,
        objectives: original.objectives,
        accessDelay: original.accessDelay,
        accessModalities: original.accessModalities,
        teachingMethods: original.teachingMethods,
        evaluationModalities: original.evaluationModalities,
        maxLearners: original.maxLearners,
        isPublic: false,
        responsibleUsers: original.responsibleUsers.length
          ? { connect: original.responsibleUsers.map((u) => ({ id: u.id })) }
          : undefined,
        subcontractors: original.subcontractors.length
          ? { connect: original.subcontractors.map((s) => ({ id: s.id })) }
          : undefined,
      },
    });

    const chapterIdMap = new Map<string, string>();
    for (const chapter of original.chapters) {
      const newChapter = await tx.chapter.create({ data: { courseId: newCourse.id, title: chapter.title } });
      chapterIdMap.set(chapter.id, newChapter.id);
    }

    for (const module of original.elearningModules) {
      const newModule = await tx.elearningModule.create({
        data: {
          courseId: newCourse.id,
          title: module.title,
          description: module.description,
          type: module.type,
          fileUrl: module.fileUrl,
          fileName: module.fileName,
          fileSizeBytes: module.fileSizeBytes,
          order: module.order,
          chapterId: module.chapterId ? chapterIdMap.get(module.chapterId) : null,
        },
      });
      if (module.quiz) {
        await tx.quiz.create({
          data: {
            moduleId: newModule.id,
            minScorePercent: module.quiz.minScorePercent,
            maxAttempts: module.quiz.maxAttempts,
            questions: {
              create: module.quiz.questions.map((q) => ({
                order: q.order,
                type: q.type,
                prompt: q.prompt,
                options: q.options ?? undefined,
                correctAnswerText: q.correctAnswerText,
              })),
            },
          },
        });
      }
      if (module.attachments.length > 0) {
        await tx.elearningModuleAttachment.createMany({
          data: module.attachments.map((a) => ({
            moduleId: newModule.id,
            title: a.title,
            fileUrl: a.fileUrl,
            fileName: a.fileName,
            fileSizeBytes: a.fileSizeBytes,
          })),
        });
      }
    }

    if (original.documentTemplates.length > 0) {
      await tx.documentTemplate.createMany({
        data: original.documentTemplates.map((t) => ({
          organizationId: session.organizationId,
          courseId: newCourse.id,
          category: t.category,
          title: t.title,
          bodyText: t.bodyText,
        })),
      });
    }

    if (original.automationRules.length > 0) {
      await tx.automationRule.createMany({
        data: original.automationRules.map((r) => ({
          organizationId: session.organizationId,
          courseId: newCourse.id,
          trigger: r.trigger,
          afterDays: r.afterDays,
          sendEmail: r.sendEmail,
          emailSubject: r.emailSubject,
          emailBody: r.emailBody,
          active: r.active,
        })),
      });
    }

    for (const survey of original.satisfactionSurveys) {
      await tx.satisfactionSurvey.create({
        data: {
          organizationId: session.organizationId,
          courseId: newCourse.id,
          kind: survey.kind,
          questions: {
            create: survey.questions.map((q) => ({ order: q.order, type: q.type, prompt: q.prompt, options: q.options ?? undefined })),
          },
        },
      });
    }

    return newCourse;
  });

  return NextResponse.json(duplicate, { status: 201 });
}
