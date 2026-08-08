import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { loadSessionActivity, activityPeriodLabel } from "@/lib/sessionActivity";
import { generateActivityPdf } from "@/lib/activityPdf";
import { borneAuxSiennesDuFormateur } from "@/lib/proprieteRoles";

// Le relevé d'activité en PDF — ce qu'on joint à un financeur, ou qu'on
// range dans le dossier d'audit, à la place de la feuille d'émargement
// qu'une formation asynchrone ne peut pas produire.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "planning") === "none") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  // Un formateur n'accède qu'à ses propres sessions — même règle que la
  // fiche session, appliquée ici aussi pour que l'export ne soit pas une
  // porte dérobée vers les apprenants des autres.
  if (borneAuxSiennesDuFormateur(auth.roles)) {
    const own = await prisma.session.findFirst({
      where: { id: params.id, organizationId: auth.organizationId, trainerId: auth.userId },
      select: { id: true },
    });
    if (!own) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const [activity, organization] = await Promise.all([
    loadSessionActivity(auth.organizationId, params.id),
    prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId }, select: { name: true } }),
  ]);
  if (!activity) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const pdf = await generateActivityPdf({
    organizationName: organization.name,
    courseTitle: activity.courseTitle,
    periodLabel: activityPeriodLabel(activity),
    generatedAt: new Date(),
    rows: activity.rows,
  });

  const fileName = `releve-activite-${activity.courseTitle}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Même double déclaration qu'ailleurs : un nom ASCII de repli pour
      // les clients anciens, et le vrai nom accentué en UTF-8.
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
