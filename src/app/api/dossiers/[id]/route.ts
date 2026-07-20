import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  learnerCategory: z.enum(["employee", "jobseeker", "individual", "apprentice"]),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const updated = await prisma.dossier.update({
    where: { id: dossier.id },
    data: { learnerCategory: parsed.data.learnerCategory },
  });
  return NextResponse.json(updated);
}
