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

  return new NextResponse(document.bodyText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${document.title}.txt"`,
    },
  });
}
