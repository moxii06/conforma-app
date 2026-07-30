import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { streamStoredFile } from "@/lib/blobStream";

// A superseded version of a module's file. Only surfaced in the admin
// "Contenu" tab of a course (version history), so it is gated on course
// management rather than on being enrolled — a learner has no reason to
// reach an older revision, and the current file is served elsewhere.
export async function GET(_request: Request, props: { params: Promise<{ versionId: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "courses") === "none") {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  const version = await prisma.elearningModuleVersion.findFirst({
    where: { id: params.versionId, module: { course: { organizationId: session.organizationId } } },
  });
  if (!version?.fileUrl) return NextResponse.json({ error: "Version introuvable." }, { status: 404 });

  return streamStoredFile(version.fileUrl, { downloadName: version.fileName ?? undefined });
}
