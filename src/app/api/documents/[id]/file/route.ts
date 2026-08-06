import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { streamStoredFile } from "@/lib/blobStream";
import { INCLUDE_ACCES_DOCUMENT, peutLireDocument } from "@/lib/documentAccess";

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
    include: INCLUDE_ACCES_DOCUMENT,
  });
  if (!document?.fileUrl) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  // La règle vit dans lib/documentAccess.ts, partagée avec
  // /api/documents/generated/[id] : le même document est servi par deux
  // chemins, il ne peut pas avoir deux règles de lecture.
  if (!peutLireDocument(document, { role: session.role, userId: session.userId })) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  return streamStoredFile(document.fileUrl, { downloadName: document.title });
}
