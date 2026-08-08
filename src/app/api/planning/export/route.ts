import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { Role, type Session as SessionRow } from "@prisma/client";
import { generatePlanningPdf } from "@/lib/planningPdf";

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

function statusLabel(s: Pick<SessionRow, "status" | "trainerId">): string {
  if (s.status === "CANCELLED") return "Annulée";
  return s.trainerId ? "Confirmée" : "Formateur à confirmer";
}

// Le relevé d'un intervenant, en PDF — ce que le filtre par intervenant du
// planning ne peut pas offrir seul : un document qu'on peut transmettre ou
// archiver, plutôt qu'un écran à consulter en direct.
export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "planning") === "none") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  // Un formateur voit déjà tout son propre planning à l'écran ; cet export
  // sert à un rôle qui regarde le planning de quelqu'un d'autre.
  if (session.role === Role.TRAINER) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const trainerId = req.nextUrl.searchParams.get("trainer");
  if (!trainerId) return NextResponse.json({ error: "Choisissez un intervenant." }, { status: 400 });

  // Bornes de période optionnelles (audit P1). Absentes = tout le planning,
  // le comportement historique. Bornes inversées : on les remet dans l'ordre
  // plutôt que d'échouer — l'intention est évidente.
  const parseDay = (v: string | null): Date | null => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  let from = parseDay(req.nextUrl.searchParams.get("from"));
  let to = parseDay(req.nextUrl.searchParams.get("to"));
  if (from && to && from > to) [from, to] = [to, from];
  const toEnd = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

  const [organization, trainer] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true } }),
    prisma.user.findFirst({
      where: { id: trainerId, organizationId: session.organizationId, role: Role.TRAINER },
      select: { id: true, name: true },
    }),
  ]);
  if (!trainer) return NextResponse.json({ error: "Intervenant introuvable." }, { status: 404 });

  const [dated, rolling] = await Promise.all([
    prisma.session.findMany({
      where: {
        organizationId: session.organizationId,
        trainerId: trainer.id,
        mode: "FIXED_DATE",
        ...(from || toEnd ? { startsAt: { ...(from ? { gte: from } : {}), ...(toEnd ? { lte: toEnd } : {}) } } : {}),
      },
      include: { course: { select: { title: true } } },
      orderBy: { startsAt: "asc" },
      take: 300,
    }),
    prisma.session.findMany({
      where: { organizationId: session.organizationId, trainerId: trainer.id, mode: "ROLLING", archivedAt: null },
      include: { course: { select: { title: true } } },
      orderBy: { startsAt: "desc" },
      take: 100,
    }),
  ]);

  const fmtDay = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const periodLabel =
    from && to
      ? `Période : du ${fmtDay(from)} au ${fmtDay(to)}`
      : from
        ? `Période : à partir du ${fmtDay(from)}`
        : to
          ? `Période : jusqu'au ${fmtDay(to)}`
          : null;

  const pdf = await generatePlanningPdf({
    organizationName: organization?.name ?? "",
    trainerName: trainer.name,
    generatedAt: new Date(),
    periodLabel,
    dated: dated.map((s) => ({
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      courseTitle: s.course.title,
      location: s.location,
      formatLabel: FORMAT_LABELS[s.format] ?? s.format,
      statusLabel: statusLabel(s),
    })),
    rolling: rolling.map((s) => ({
      courseTitle: s.course.title,
      location: s.location,
      formatLabel: FORMAT_LABELS[s.format] ?? s.format,
      statusLabel: statusLabel(s),
    })),
  });

  const fileName = `Planning-${trainer.name.replace(/[^\w\-]+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Même contournement Latin-1/UTF-8 que les autres téléchargements de
      // l'application : l'en-tête n'accepte pas les accents en direct.
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
