import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSessionContext } from "@/lib/tenant";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo — a signature logo, not a document
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

// Uploads a logo image for the caller's own email signature (SignatureEditor
// on /profil) — separate from documentSending.ts's Blob usage since this is
// a small always-https image asset, not a generated/uploaded document.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
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
  const blob = await put(`signatures/${session.organizationId}/${session.userId}/${file.name}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  return NextResponse.json({ url: blob.url }, { status: 201 });
}
