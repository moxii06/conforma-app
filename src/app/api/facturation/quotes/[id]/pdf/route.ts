import { NextResponse } from "next/server";
import { getSessionContext, can } from "@/lib/tenant";
import { buildFacturationPdf } from "@/lib/invoiceDocument";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const built = await buildFacturationPdf("quote", id, session.organizationId);
  if (!built) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  return new NextResponse(new Uint8Array(built.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${built.fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
    },
  });
}
