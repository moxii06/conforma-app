import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { clientIp } from "@/lib/rateLimit";
import { loadWithdrawalGate } from "@/lib/withdrawalGate";

const schema = z.object({ dossierId: z.string().min(1) });

// Records the learner's express request for early access — the click behind
// the checkbox in WithdrawalGatePanel. What lands in the row is what a
// dispute would ask for: the instant, the address, the exact wording (the
// server-side constant, NOT anything the client sent — a tampered request
// body must not be able to write its own waiver text), and the fact the
// checkbox started unchecked.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== "LEARNER") {
    // Staff cannot waive on a learner's behalf: the request must be the
    // consumer's own, or it proves nothing.
    return NextResponse.json({ error: "Seul l'apprenant peut formuler cette demande." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: session.organizationId, learnerUserId: session.userId },
    select: { id: true, organizationId: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  // Idempotent: a second click returns the existing record rather than
  // failing — but never refreshes it. The evidence is the FIRST acceptance.
  const existing = await prisma.withdrawalWaiver.findUnique({ where: { dossierId: dossier.id } });
  if (existing) return NextResponse.json({ acceptedAt: existing.acceptedAt });

  const gate = await loadWithdrawalGate(dossier.id);
  if (!gate.active) {
    // Nothing to waive: either the period already ran out or no platform-
    // signed contract started it. Recording a waiver here would fabricate
    // evidence about a right that wasn't in play.
    return NextResponse.json({ error: "Aucun délai de rétractation en cours sur cette formation." }, { status: 400 });
  }

  // Aucun fondement, rien à faire signer.
  //
  // Une formation sans e-learning qui déborde des quatorze jours ne relève
  // d'aucune exception de l'art. L.221-28 : le droit de rétractation court,
  // et enregistrer une renonciation sans fondement serait pire que ne rien
  // faire — une preuve d'un acte que la loi ne permet pas.
  if (!gate.waiverBasis || !gate.waiverText) {
    return NextResponse.json(
      { error: "Cette formation ne permet pas de renoncer au délai de rétractation." },
      { status: 400 },
    );
  }

  const waiver = await prisma.withdrawalWaiver.create({
    data: {
      organizationId: dossier.organizationId,
      dossierId: dossier.id,
      ipAddress: clientIp(request.headers),
      // Le texte vient du MÊME calcul que celui qui l'a affiché
      // (loadWithdrawalGate), pas d'une constante choisie ici : c'est la
      // seule façon que la preuve corresponde à ce qui était à l'écran.
      textAccepted: gate.waiverText,
      legalBasis: gate.waiverBasis,
      checkboxDefaultUnchecked: true,
    },
  });

  return NextResponse.json({ acceptedAt: waiver.acceptedAt }, { status: 201 });
}
