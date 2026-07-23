import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { summarizeQualiopiIndicator } from "@/lib/ai";

const schema = z.object({ indicatorNumber: z.number().int().min(1).max(99), force: z.boolean().optional() });

const CRITERION_LABELS: Record<number, string> = {
  1: "Conditions d'information du public",
  2: "Identification des objectifs et adaptation des prestations",
  3: "Adaptation aux publics bénéficiaires",
  4: "Adéquation des moyens pédagogiques et techniques",
  5: "Qualification et développement des compétences des personnels",
  6: "Inscription dans l'environnement professionnel",
  7: "Recueil et prise en compte des appréciations",
};

// Generation is gated the same as tab visibility (any qualiopi access, not
// just "full") since this is informational, not a compliance sign-off —
// unlike the gathered-evidence checkbox. Cached in AuditChecklistItem so a
// given org+indicator pair only ever costs one real OpenAI call unless
// staff explicitly asks to regenerate.
export async function POST(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "qualiopi") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  if (!parsed.data.force) {
    const existing = await prisma.auditChecklistItem.findUnique({
      where: { organizationId_indicatorNumber: { organizationId: auth.organizationId, indicatorNumber: parsed.data.indicatorNumber } },
    });
    if (existing?.personalizedSummary) {
      return NextResponse.json({ summary: existing.personalizedSummary, cached: true });
    }
  }

  const organizationForVersion = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const indicator = organizationForVersion.activeReferentielVersionId
    ? await prisma.qualiopiIndicator.findUnique({
        where: {
          versionId_number: { versionId: organizationForVersion.activeReferentielVersionId, number: parsed.data.indicatorNumber },
        },
      })
    : null;
  if (!indicator) return NextResponse.json({ error: "Indicateur introuvable." }, { status: 404 });

  const [organization, courses, sessions] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }),
    prisma.course.findMany({ where: { organizationId: auth.organizationId }, select: { title: true } }),
    prisma.session.findMany({ where: { organizationId: auth.organizationId }, select: { format: true }, distinct: ["format"] }),
  ]);

  const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "présentiel", REMOTE: "distanciel", HYBRID: "mixte" };

  try {
    const summary = await summarizeQualiopiIndicator({
      indicatorLabel: `#${indicator.number} — ${indicator.label}`,
      criterionLabel: `${indicator.criterionNumber} — ${CRITERION_LABELS[indicator.criterionNumber] ?? ""}`,
      organizationName: organization.name,
      courseTitles: courses.map((c) => c.title),
      formats: sessions.map((s) => FORMAT_LABELS[s.format] ?? s.format),
    });

    await prisma.auditChecklistItem.upsert({
      where: { organizationId_indicatorNumber: { organizationId: auth.organizationId, indicatorNumber: indicator.number } },
      update: { personalizedSummary: summary, personalizedSummaryAt: new Date() },
      create: { organizationId: auth.organizationId, indicatorNumber: indicator.number, personalizedSummary: summary, personalizedSummaryAt: new Date() },
    });

    return NextResponse.json({ summary, cached: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 502 });
  }
}
