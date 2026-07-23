import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Revokes a learner's access to a module — deletes the ElearningProgress
// row (see schema.prisma: that row IS the assignment). Staff-only, same as
// granting it. Deletes real progress data along with access; there's no
// separate "assigned but hidden" state in this scope, so revoking is
// destructive by design — the UI should confirm before calling this.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const progress = await prisma.elearningProgress.findFirst({
    where: { id: params.id, module: { course: { organizationId: auth.organizationId } } },
  });
  if (!progress) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  await prisma.elearningProgress.delete({ where: { id: progress.id } });
  return NextResponse.json({ ok: true });
}
