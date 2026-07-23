import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";

const schema = z.object({
  description: z.string().min(1),
  reporterName: z.string().optional(),
  reporterContact: z.string().optional(),
  anonymous: z.boolean().optional(),
});

// Open to every authenticated role — see the "support" feature comment in
// src/lib/tenant.ts. The reporter can opt out of giving their name; nothing
// forces identification, which is the point of a real reporting channel.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const report = await prisma.secureReport.create({
    data: {
      organizationId: session.organizationId,
      description: parsed.data.description,
      reporterName: parsed.data.anonymous ? null : parsed.data.reporterName || session.name || session.email,
      reporterContact: parsed.data.anonymous ? null : parsed.data.reporterContact || null,
    },
  });

  return NextResponse.json({ ok: true, id: report.id }, { status: 201 });
}
