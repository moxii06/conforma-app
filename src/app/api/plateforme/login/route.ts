import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPlatformAdminPassword, setPlatformAdminCookie } from "@/lib/platformAdmin";

const schema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  if (!process.env.PLATFORM_ADMIN_SECRET) {
    return NextResponse.json({ error: "PLATFORM_ADMIN_SECRET non configuré côté serveur." }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Mot de passe requis." }, { status: 400 });

  if (!checkPlatformAdminPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  await setPlatformAdminCookie();
  return NextResponse.json({ ok: true });
}
