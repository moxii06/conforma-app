import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { computeIndicator, COMPUTABLE_METRICS } from "@/lib/resultIndicators";

const schema = z.object({
  label: z.string().min(1),
  courseId: z.string().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  computedFrom: z.enum(["elearning_completion", "hot_evaluation_rate", "manual"]),
  // Only used when computedFrom === "manual" — a computable metric derives
  // these from real data instead (see computeIndicator).
  manualDefinition: z.string().optional(),
  manualFormula: z.string().optional(),
  manualTotalPopulation: z.number().int().min(0).optional(),
  manualRespondents: z.number().int().min(0).optional(),
  exclusions: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  if (data.courseId) {
    const course = await prisma.course.findFirst({ where: { id: data.courseId, organizationId: session.organizationId } });
    if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  }

  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return NextResponse.json({ error: "Période invalide." }, { status: 400 });
  }

  let definition: string;
  let formula: string;
  let totalPopulation: number;
  let respondents: number;

  if (data.computedFrom === "manual") {
    if (!data.manualDefinition || !data.manualFormula || data.manualTotalPopulation == null || data.manualRespondents == null) {
      return NextResponse.json({ error: "Définition, formule, population et répondants requis en saisie manuelle." }, { status: 400 });
    }
    definition = data.manualDefinition;
    formula = data.manualFormula;
    totalPopulation = data.manualTotalPopulation;
    respondents = data.manualRespondents;
  } else {
    const meta = COMPUTABLE_METRICS[data.computedFrom];
    definition = meta.definition;
    formula = meta.formula;
    const result = await computeIndicator({
      organizationId: session.organizationId,
      metric: data.computedFrom,
      courseId: data.courseId,
      periodStart,
      periodEnd,
    });
    totalPopulation = result.totalPopulation;
    respondents = result.respondents;
  }

  const exclusions = data.exclusions ?? 0;
  const effectivePopulation = totalPopulation - exclusions;
  const computedValue = effectivePopulation > 0 ? Math.round((respondents / effectivePopulation) * 1000) / 10 : null;

  const indicator = await prisma.resultIndicator.create({
    data: {
      organizationId: session.organizationId,
      courseId: data.courseId || null,
      label: data.label,
      definition,
      formula,
      computedFrom: data.computedFrom,
      periodStart,
      periodEnd,
      totalPopulation,
      respondents,
      exclusions,
      computedValue,
    },
  });

  return NextResponse.json(indicator, { status: 201 });
}
