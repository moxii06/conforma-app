import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { streamStoredFile } from "@/lib/blobStream";

// Serves an uploaded document's bytes behind the same access rules that
// decide who may see the record it hangs off.
//
// Uploads are private blobs now (see src/lib/storage.ts), so the stored URL
// is no longer something the browser can open on its own — this route is how
// a document gets read. It also stops the app from handing out a permanent
// unauthenticated link, which is what the raw blob URL used to be.
//
// The three ownership shapes below mirror the queries that already list these
// documents (mon-espace for a learner, /dossiers for staff, /team for member
// and subcontractor records) rather than inventing a looser rule.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { dossier: { select: { learnerUserId: true, session: { select: { trainerId: true } } } } },
  });
  if (!document?.fileUrl) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const denied = NextResponse.json({ error: "Action non autorisée." }, { status: 403 });

  if (session.role === Role.LEARNER) {
    // Their own dossier's documents, nothing else — same rule as the
    // mon-espace listing.
    if (!document.dossier || document.dossier.learnerUserId !== session.userId) return denied;
  } else if (document.dossierId) {
    if (can(session.role, "dossiers") === "none") return denied;
    // TRAINER sees their own sessions only, the same second-layer ownership
    // filter /dossiers applies.
    if (session.role === Role.TRAINER && document.dossier?.session.trainerId !== session.userId) return denied;
  } else {
    // Team member / subcontractor record (CV, diploma, contract).
    if (can(session.role, "team") === "none") return denied;
  }

  return streamStoredFile(document.fileUrl, { downloadName: document.title });
}
