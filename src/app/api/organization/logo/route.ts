import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo — a logo mark, not a document
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

// Marque blanche logo — same upload pattern as /api/profile/signature-logo,
// but persists straight to Organization.logoUrl since it's a singleton org
// asset (shown in the learner Sidebar and public token pages) rather than
// something embedded ad hoc into rich text.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Réservé à l'administrateur de l'organisme." }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Stockage de fichiers momentanément indisponible." }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Image requise." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image trop volumineuse (2 Mo maximum)." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format d'image non supporté (PNG, JPEG, GIF, WebP ou SVG)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(`branding/${session.organizationId}/${file.name}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: { logoUrl: blob.url },
  });

  return NextResponse.json({ logoUrl: updated.logoUrl }, { status: 201 });
}

export async function DELETE() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Réservé à l'administrateur de l'organisme." }, { status: 403 });
  }

  await prisma.organization.update({ where: { id: session.organizationId }, data: { logoUrl: null } });
  return NextResponse.json({ ok: true });
}
