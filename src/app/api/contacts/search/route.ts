import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Backs the "apprenant existant" search when adding a learner to a course —
// staff-only (same gate as enrollment itself), capped to a handful of
// results since it's an autocomplete, not a listing.
//
// Le triage de la boîte mail s'en sert aussi désormais (« rattacher à un
// contact existant »), et un commercial y a accès sans avoir le planning en
// écriture : d'où la seconde porte. Elle n'ouvre rien de neuf — un
// commercial voit déjà ces noms dans son CRM. Un formateur, lui, n'a pas
// accès à la boîte mail et reste donc dehors.
export async function GET(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "planning") !== "full" && can(auth.roles, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: auth.organizationId,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { lastName: "asc" },
    take: 8,
  });

  return NextResponse.json(contacts);
}
