import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Qui peut recevoir ce document.
//
// Groupé par provenance, les inscrits à la formation d'abord : c'est le cas
// courant, et une liste à plat de tous les contacts de l'organisme
// obligerait à retrouver huit noms qu'on connaît déjà. Le dialogue
// pré-coche le premier groupe pour la même raison — décocher est plus
// rapide que cocher huit cases.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const doc = await prisma.document.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    select: { dossierId: true },
  });
  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  // Le document porte le dossier du premier inscrit ; c'est par sa session
  // qu'on retrouve toute la promotion.
  const sessionId = doc.dossierId
    ? (await prisma.dossier.findUnique({ where: { id: doc.dossierId }, select: { sessionId: true } }))?.sessionId ?? null
    : null;

  const inscrits = sessionId
    ? await prisma.dossier.findMany({
        where: { sessionId, organizationId: auth.organizationId },
        include: { contact: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const dejaVus = new Set(inscrits.map((d) => d.contactId));
  const autres = await prisma.contact.findMany({
    where: { organizationId: auth.organizationId, id: { notIn: [...dejaVus] } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { lastName: "asc" },
    take: 200,
  });

  const sousTraitants = await prisma.subcontractor.findMany({
    where: { organizationId: auth.organizationId },
    select: { id: true, name: true, contactEmail: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    groups: [
      {
        titre: "Apprenants de la formation",
        membres: inscrits.map((d) => ({
          dossierId: d.id,
          contactId: d.contactId,
          name: `${d.contact.firstName} ${d.contact.lastName}`,
          email: d.contact.email,
        })),
      },
      {
        titre: "Autres contacts",
        membres: autres.map((c) => ({
          dossierId: null,
          contactId: c.id,
          name: `${c.firstName} ${c.lastName}`,
          email: c.email,
        })),
      },
      {
        titre: "Sous-traitants et intervenants",
        membres: sousTraitants.map((s) => ({ dossierId: null, contactId: null, name: s.name, email: s.contactEmail ?? "" })),
      },
    ],
  });
}
