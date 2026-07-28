import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, can } from "@/lib/tenant";
import { generateCourseOutline } from "@/lib/ai";

const schema = z.object({ title: z.string().min(1), intention: z.string().min(1) });

// Phase 4 §B1 — see generateCourseOutline's own comment for scope. Same
// permission gate as course creation itself (planning: full), since this
// is only ever reached from CreateCourseForm.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Titre et intention requis." }, { status: 400 });

  try {
    const outline = await generateCourseOutline(parsed.data);
    return NextResponse.json(outline);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de la génération." }, { status: 502 });
  }
}
