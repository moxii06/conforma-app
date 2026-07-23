import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!document || !document.bodyText) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  // Content-Disposition's `filename` param is a ByteString (Latin-1 only) —
  // a title with an em-dash or other character outside that range (common
  // here, e.g. "Attestation — Nom") throws when building the header rather
  // than just mangling it. `filename*` (RFC 6266) carries the real UTF-8
  // name; the ASCII `filename` fallback strips anything Latin-1 can't hold.
  const asciiFallback = document.title.replace(/[^\x20-\x7E]/g, "_");
  const utf8Name = encodeURIComponent(`${document.title}.txt`);

  return new NextResponse(document.bodyText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${asciiFallback}.txt"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
