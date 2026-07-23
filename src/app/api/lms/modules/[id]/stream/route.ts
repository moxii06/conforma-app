import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Proxies the actual video bytes instead of handing out the raw Vercel Blob
// URL to the client — that URL is otherwise a public, permanent, shareable
// link (Blob storage here is `access: "public"`, chosen for simplicity),
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
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_ || !module_.fileUrl) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  if (module_.type !== "video") return NextResponse.json({ error: "Ce module n'est pas une vidéo." }, { status: 400 });

  const isStaff = can(session.role, "dossiers") !== "none";
  if (!isStaff) {
    const progress = await prisma.elearningProgress.findFirst({
      where: { moduleId: module_.id, dossier: { organizationId: session.organizationId, learnerUserId: session.userId } },
    });
    if (!progress) return NextResponse.json({ error: "Ce module ne vous a pas été assigné." }, { status: 403 });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(module_.fileUrl, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
