import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canWriteRgpd } from "@/lib/tenant";
import { borneAuxSiennesDuFormateur } from "@/lib/proprieteRoles";

const schema = z.object({
  learnerCategory: z.enum(["employee", "jobseeker", "individual", "apprentice"]).optional(),
  // ISO date string to schedule the purge, or null to clear it back to
  // "Non planifiée" — client feedback: this was display-only before, no
  // action existed to actually set it from the dossier's RGPD tab.
  retentionUntil: z.string().nullable().optional(),
  // Manual override for the "Parcours de formation" checklist — client
  // feedback: these were purely automatic (flipped only by the matching
  // send/acknowledge/form-submit action) with no way to correct a mistake
  // or record something that happened outside the platform (e.g. a
  // convention signed on paper). The automatic paths stay the primary way
  // these get set; this is just an escape hatch on top.
  needsAssessmentDone: z.boolean().optional(),
  contractSigned: z.boolean().optional(),
  convocationSent: z.boolean().optional(),
  evaluationHotDone: z.boolean().optional(),
  evaluationColdDone: z.boolean().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const touchesSteps =
    parsed.data.needsAssessmentDone !== undefined ||
    parsed.data.contractSigned !== undefined ||
    parsed.data.convocationSent !== undefined ||
    parsed.data.evaluationHotDone !== undefined ||
    parsed.data.evaluationColdDone !== undefined;

  // Three different fields, three different permissions: learnerCategory is
  // a "dossiers" full write (BPF categorization), retentionUntil is an RGPD
  // write (purge scheduling), and the Parcours steps follow the same gate
  // as the Communications actions on this same page (canManageOutreach).
  if (parsed.data.learnerCategory !== undefined && can(session.roles, "dossiers") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (parsed.data.retentionUntil !== undefined && !canWriteRgpd(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (touchesSteps && can(session.roles, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { session: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  // Borne calculée sur les rôles effectifs — voir lib/proprieteRoles.ts.
  if (touchesSteps && borneAuxSiennesDuFormateur(session.roles) && dossier.session.trainerId !== session.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  let retentionUntil: Date | null | undefined = undefined;
  if (parsed.data.retentionUntil !== undefined) {
    if (parsed.data.retentionUntil === null) {
      retentionUntil = null;
    } else {
      const parsedDate = new Date(parsed.data.retentionUntil);
      if (Number.isNaN(parsedDate.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      retentionUntil = parsedDate;
    }
  }

  const updated = await prisma.dossier.update({
    where: { id: dossier.id },
    data: {
      ...(parsed.data.learnerCategory !== undefined ? { learnerCategory: parsed.data.learnerCategory } : {}),
      ...(retentionUntil !== undefined ? { retentionUntil } : {}),
      ...(parsed.data.needsAssessmentDone !== undefined ? { needsAssessmentDone: parsed.data.needsAssessmentDone } : {}),
      ...(parsed.data.contractSigned !== undefined ? { contractSigned: parsed.data.contractSigned } : {}),
      ...(parsed.data.convocationSent !== undefined ? { convocationSent: parsed.data.convocationSent } : {}),
      ...(parsed.data.evaluationHotDone !== undefined ? { evaluationHotDone: parsed.data.evaluationHotDone } : {}),
      ...(parsed.data.evaluationColdDone !== undefined ? { evaluationColdDone: parsed.data.evaluationColdDone } : {}),
    },
  });
  return NextResponse.json(updated);
}

// Client feedback: a learner enrolled by mistake (or a pure duplicate) had
// no way to be removed from a course's roster. No cascade here on purpose —
// every related table (Document, Invoice, ClientOutreach, elearningProgress...)
// keeps its default FK restrict, so a dossier with real history (a document
// sent, an invoice, tracked progress) simply can't be deleted; the 409 below
// tells staff why instead of the request silently 500-ing.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossier = await prisma.dossier.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  try {
    await prisma.dossier.delete({ where: { id: dossier.id } });
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de retirer cet apprenant : des documents, factures ou un suivi de progression existent déjà pour ce dossier.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
