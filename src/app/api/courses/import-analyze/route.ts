import { NextResponse } from "next/server";
import { getDocumentProxy, extractText } from "unpdf";
import { getSessionContext, can } from "@/lib/tenant";
import { extractCourseInfoFromDocument } from "@/lib/ai";

// Client feedback (audit UX, inspired by Digiforma's "importez votre
// programme, l'IA crée votre session") : the course creation form asks for
// title/description/durationHours — this reads a PDF programme/convention
// already on the OF's computer and extracts exactly those three fields,
// so staff review and adjust rather than retype from scratch. Never
// creates anything itself; CreateCourseForm drops the result into its own
// editable fields, same as every other AI suggestion in this app.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Fichier PDF requis." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Seuls les fichiers PDF sont pris en charge pour l'instant." }, { status: 400 });
  }

  let text: string;
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const result = await extractText(pdf, { mergePages: true });
    text = result.text;
  } catch (e) {
    console.error("PDF parse error:", e);
    return NextResponse.json({ error: "Impossible de lire ce PDF — le fichier est peut-être corrompu ou protégé." }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ error: "Aucun texte trouvé dans ce PDF (peut-être un scan sans OCR)." }, { status: 400 });
  }

  try {
    const extraction = await extractCourseInfoFromDocument(text);
    return NextResponse.json(extraction);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de l'analyse." }, { status: 502 });
  }
}
