import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ courseId: z.string().min(1), title: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const course = await prisma.course.findFirst({
    where: { id: parsed.data.courseId, organizationId: session.organizationId },
  });
  if (!course) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });

  const module_ = await prisma.elearningModule.create({
    data: { courseId: course.id, title: parsed.data.title },
  });

  return NextResponse.json(module_, { status: 201 });
}
