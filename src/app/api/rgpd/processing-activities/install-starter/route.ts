import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";
import { STARTER_REGISTER, STARTER_SUB_PROCESSORS } from "@/lib/rgpdStarterRegister";

// Installe le registre type dans l'organisation.
//
// Le catalogue vit en TypeScript et non en base : tant que l'organisme ne
// l'a pas installé, ce ne sont pas ses données. Une fois installé, ce sont
// des lignes ordinaires qu'il modifie et supprime — pas un modèle en
// lecture seule qu'il faudrait « forker ».
//
// Idempotent par le nom : relancer n'écrase rien et ne duplique rien, ce qui
// permet aussi de récupérer les traitements ajoutés au catalogue plus tard.
const schema = z.object({ includeSubProcessors: z.boolean().default(true) });

export async function POST(req: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.roles)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const { organizationId } = session;

  const existants = await prisma.processingActivity.findMany({
    where: { organizationId },
    select: { name: true },
  });
  const dejaLa = new Set(existants.map((a) => a.name));
  const aCreer = STARTER_REGISTER.filter((p) => !dejaLa.has(p.name));

  if (aCreer.length > 0) {
    await prisma.processingActivity.createMany({
      data: aCreer.map((p) => ({
        organizationId,
        name: p.name,
        purpose: p.purpose,
        legalBasis: p.legalBasis,
        dataSubjects: p.dataSubjects,
        dataCategories: p.dataCategories,
        recipients: p.recipients,
        retentionPeriod: p.retentionPeriod,
        // Les lignes qui demandent une décision de l'organisme arrivent
        // signalées « à revoir » plutôt que présentées comme acquises : un
        // registre installé d'un clic ne doit pas laisser croire que la
        // conformité l'est aussi.
        riskFlag: p.needsReview ? "to_review" : "ok",
        reviewNote: p.reviewNote ?? null,
      })),
    });
  }

  let sousTraitantsCrees = 0;
  if (parsed.data.includeSubProcessors) {
    const dejaSt = new Set(
      (await prisma.subProcessor.findMany({ where: { organizationId }, select: { name: true } })).map((s) => s.name),
    );
    const stACreer = STARTER_SUB_PROCESSORS.filter((s) => !dejaSt.has(s.name));
    if (stACreer.length > 0) {
      await prisma.subProcessor.createMany({
        data: stACreer.map((s) => ({ organizationId, name: s.name, role: s.role, location: s.location })),
      });
      sousTraitantsCrees = stACreer.length;
    }
  }

  return NextResponse.json({ created: aCreer.length, subProcessorsCreated: sousTraitantsCrees }, { status: 201 });
}
