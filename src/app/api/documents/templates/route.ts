import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const CATEGORIES = [
  "needs_assessment",
  "convention",
  "convocation",
  "eval_hot",
  "eval_cold",
  "cgv",
  "internal_rules",
  "other",
] as const;

const schema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1),
  bodyText: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const template = await prisma.documentTemplate.create({
    data: { organizationId: session.organizationId, ...parsed.data },
  });

  return NextResponse.json(template, { status: 201 });
}
