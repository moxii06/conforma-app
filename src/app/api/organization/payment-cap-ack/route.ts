import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Records that this organisation knowingly kept a payment schedule exceeding
// the 30 % ceiling of art. L.6353-6 (see PaymentScheduleBuilder).
//
// Who and when, not just a boolean: the value of this row is evidential. It
// exists so that, the day an organisation says it was never told, there is
// an answer naming the person who ticked the box and the moment they did.
//
// Idempotent — re-acknowledging keeps the first acceptance rather than
// refreshing it. The date that matters is the day the organisation first
// decided, not the last time it happened to see the warning again.
export async function POST() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { paymentCapAckAt: true, paymentCapAckByName: true },
  });
  if (organization.paymentCapAckAt) return NextResponse.json(organization);

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      paymentCapAckAt: new Date(),
      paymentCapAckByName: session.name || session.email,
    },
    select: { paymentCapAckAt: true, paymentCapAckByName: true },
  });

  return NextResponse.json(updated);
}
