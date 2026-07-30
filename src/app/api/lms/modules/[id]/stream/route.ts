import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { streamStoredFile } from "@/lib/blobStream";

// Proxies the actual video bytes instead of handing out the raw Vercel Blob
// URL to the client. Uploads land in the private store now, so that URL no
// longer grants access on its own — but it used to, permanently and to
// anyone holding it, which is why nothing downstream is given it,
// which defeats any client-side "don't allow download" UI entirely: anyone
// with the link could fetch it directly regardless of what the <video>
// element's controls allow. Routing through here means the video is only
// ever reachable by a session that's actually authorized for this specific
// module, and the link a learner could copy out of devtools is this
// session-gated URL, not a permanent public one.
//
// Honesty limit: this stops link-sharing and the browser's built-in
// "download" affordances (right-click save, the controls download button).
// It is not DRM — a determined viewer can still screen-record the playback.
// Real stream encryption (Widevine/FairPlay) needs a licensed CDM service
// and is out of scope for a self-hosted Blob-backed player.
//
// Range support is required, not optional: without honoring Range
// requests, the <video> element can't seek without re-downloading from the
// start, and Safari/iOS won't play at all.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_ || !module_.fileUrl) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const isStaff = can(session.role, "dossiers") !== "none";
  if (!isStaff) {
    const progress = await prisma.elearningProgress.findFirst({
      where: { moduleId: module_.id, dossier: { organizationId: session.organizationId, learnerUserId: session.userId } },
    });
    if (!progress) return NextResponse.json({ error: "Ce module ne vous a pas été assigné." }, { status: 403 });
  }

  return streamStoredFile(module_.fileUrl, {
    range: request.headers.get("range"),
    fallbackContentType: module_.type === "video" ? "video/mp4" : undefined,
    downloadName: module_.fileName ?? undefined,
  });
}
