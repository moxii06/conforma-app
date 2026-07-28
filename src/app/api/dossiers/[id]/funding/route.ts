import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const commitmentSchema = z.object({
  funderId: z.string().min(1),
  amountCents: z.number().int().positive().max(100_000_000),
  subrogation: z.boolean(),
  agreementNumber: z.string().max(120).optional(),
  agreementDate: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(["requested", "granted", "refused", "invoiced", "paid"]).optional(),
  notes: z.string().max(2000).optional(),
});

const patchSchema = z.object({
  // Null clears it, falling back to the course's catalogue price.
  agreedPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  commitmentId: z.string().optional(),
  status: z.enum(["requested", "granted", "refused", "invoiced", "paid"]).optional(),
});

function parseDate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Funding lives on the dossier but is money data — gated on "invoicing", so
// a trainer or a sales rep who can open the dossier still can't rewrite who
// pays for it.
async function authorize(dossierId: string) {
  const session = await getSessionContext();
  if (!session) return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  if (can(session.role, "invoicing") === "none") {
    return { error: NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 }) };
  }
  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organizationId: session.organizationId },
  });
  if (!dossier) return { error: NextResponse.json({ error: "Dossier introuvable." }, { status: 404 }) };
  return { session, dossier };
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorize(params.id);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = commitmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // Scoped lookup, not a bare findUnique: a funderId from another tenant
  // must not be attachable to this dossier.
  const funder = await prisma.funder.findFirst({
    where: { id: parsed.data.funderId, organizationId: auth.session.organizationId },
  });
  if (!funder) return NextResponse.json({ error: "Financeur introuvable." }, { status: 404 });

  const commitment = await prisma.fundingCommitment.create({
    data: {
      organizationId: auth.session.organizationId,
      dossierId: auth.dossier.id,
      funderId: funder.id,
      amountCents: parsed.data.amountCents,
      subrogation: parsed.data.subrogation,
      agreementNumber: parsed.data.agreementNumber || null,
      agreementDate: parseDate(parsed.data.agreementDate),
      validUntil: parseDate(parsed.data.validUntil),
      status: parsed.data.status ?? "requested",
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json(commitment, { status: 201 });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorize(params.id);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.commitmentId && parsed.data.status) {
    const updated = await prisma.fundingCommitment.updateMany({
      where: {
        id: parsed.data.commitmentId,
        dossierId: auth.dossier.id,
        organizationId: auth.session.organizationId,
      },
      data: { status: parsed.data.status },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Engagement introuvable." }, { status: 404 });
  }

  if (parsed.data.agreedPriceCents !== undefined) {
    await prisma.dossier.update({
      where: { id: auth.dossier.id },
      data: { agreedPriceCents: parsed.data.agreedPriceCents },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorize(params.id);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const commitmentId = searchParams.get("commitmentId");
  if (!commitmentId) return NextResponse.json({ error: "Engagement non précisé." }, { status: 400 });

  const deleted = await prisma.fundingCommitment.deleteMany({
    where: { id: commitmentId, dossierId: auth.dossier.id, organizationId: auth.session.organizationId },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "Engagement introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
