import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { sanitizeRichText } from "@/lib/richText";

const schema = z.object({ signature: z.string() });

// A user's own signature only — no one else's, no permission gate beyond
// being logged in (every role that sends anything gets one).
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const sanitized = sanitizeRichText(parsed.data.signature);
  await prisma.user.update({ where: { id: session.userId }, data: { emailSignature: sanitized } });

  return NextResponse.json({ ok: true, signature: sanitized });
}
