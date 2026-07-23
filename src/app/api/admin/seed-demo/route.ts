import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedBase } from "../../../../../prisma/lib/seed-base";
import { seedDemoData } from "../../../../../prisma/lib/seed-demo";

// TEMPORARY — one-shot endpoint to populate the demo dataset (org_demo)
// on whichever database DATABASE_URL points at, without ever exposing
// that connection string. Guarded by a secret header rather than a user
// session because it's meant to be called once, by hand, right after
// deploy — remove this route (and the SEED_DEMO_SECRET env var) once the
// demo data is confirmed live.
export async function POST(request: Request) {
  const expected = process.env.SEED_DEMO_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "SEED_DEMO_SECRET non configuré." }, { status: 503 });
  }
  const provided = request.headers.get("x-seed-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    await seedBase(prisma);
    const result = await seedDemoData(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("seed-demo failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}
