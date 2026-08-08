import { NextResponse } from "next/server";
import { z } from "zod";
import { SessionFormat, SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  trainerId: z.string().nullable().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  format: z.nativeEnum(SessionFormat).optional(),
  location: z.string().nullable().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  // Règles du parcours portées par la session. `null` est une valeur à part
  // entière et non « champ absent » : c'est le retour à l'héritage de la
  // formation, et c'est ce que fait le bouton « Revenir à l'héritage ».
  // D'où `.nullable().optional()` et non `.optional()` seul.
  sequentialUnlock: z.boolean().nullable().optional(),
  allowVideoSkip: z.boolean().nullable().optional(),
  withdrawalAccessPolicy: z.enum(["closed", "partial"]).nullable().optional(),
  // Le mode de conclusion du contrat — le vrai critère du droit de
  // rétractation (voir lib/withdrawalGate.ts). Volontairement borné à
  // l'énumération : une chaîne libre ici ferait silencieusement retomber
  // delaiRetractationApplicable() sur « délai applicable ».
  contractSigningMode: z.enum(["remote", "in_person"]).nullable().optional(),
});

// Single PATCH for both "edit the session's details" (date/trainer/format/
// location/capacity, while it's still DRAFT and being put together) and
// "validate it" (status: DRAFT -> VALIDATED, the point at which the
// Planning detail page starts prompting to send convocations) — both are
// just Session field updates, no need for two routes.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.session.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!existing) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
  const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }

  if (data.trainerId) {
    const trainer = await prisma.user.findFirst({ where: { id: data.trainerId, organizationId: auth.organizationId } });
    if (!trainer) return NextResponse.json({ error: "Formateur introuvable." }, { status: 404 });
  }

  const updated = await prisma.session.update({
    where: { id: existing.id },
    data: {
      ...(data.trainerId !== undefined ? { trainerId: data.trainerId } : {}),
      ...(data.startsAt ? { startsAt } : {}),
      ...(data.endsAt ? { endsAt } : {}),
      ...(data.format ? { format: data.format } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.capacity ? { capacity: data.capacity } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.sequentialUnlock !== undefined ? { sequentialUnlock: data.sequentialUnlock } : {}),
      ...(data.allowVideoSkip !== undefined ? { allowVideoSkip: data.allowVideoSkip } : {}),
      ...(data.withdrawalAccessPolicy !== undefined ? { withdrawalAccessPolicy: data.withdrawalAccessPolicy } : {}),
      ...(data.contractSigningMode !== undefined ? { contractSigningMode: data.contractSigningMode } : {}),
    },
    include: { course: true, trainer: true },
  });

  return NextResponse.json(updated);
}
