import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  dossierId: z.string().optional(),
  category: z.enum(["complaint", "question", "other"]).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  let dossierId: string | null = null;
  if (parsed.data.dossierId) {
    const dossier = await prisma.dossier.findFirst({ where: { id: parsed.data.dossierId, organizationId: session.organizationId } });
    if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
    const isOwnDossier = session.role === "LEARNER" && dossier.learnerUserId === session.userId;
    const isStaff = can(session.role, "dossiers") !== "none";
    if (!isOwnDossier && !isStaff) {
      return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
    }
    dossierId = dossier.id;
  }

  const complaint = await prisma.complaint.create({
    data: {
      organizationId: session.organizationId,
      dossierId,
      subject: parsed.data.subject,
      description: parsed.data.description,
      category: parsed.data.category ?? "other",
      submittedByName: session.name || session.email,
      submittedByEmail: session.email,
    },
  });

  return NextResponse.json(complaint, { status: 201 });
}
