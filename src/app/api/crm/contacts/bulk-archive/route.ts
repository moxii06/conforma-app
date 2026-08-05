import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { MAX_CONTACTS_PAR_LOT } from "@/lib/bulkLimits";

/**
 * Archiver (ou désarchiver) plusieurs contacts d'un coup.
 *
 * Pendant en masse de /api/crm/contacts/[id]/archive (audit S7, P2 :
 * « archiver se fait un par un »). L'archivage ne détruit rien et se
 * défait — c'est ce qui permet ici un simple updateMany là où le
 * changement de statut d'une facture demande un traitement ligne à ligne.
 *
 * Le `organizationId` est dans le where, pas seulement vérifié avant : un
 * identifiant venu d'ailleurs ne peut pas être touché, même s'il figure
 * dans la liste envoyée.
 */

const schema = z.object({
  contactIds: z.array(z.string()).min(1).max(MAX_CONTACTS_PAR_LOT),
  archived: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Requête invalide (au plus ${MAX_CONTACTS_PAR_LOT} contacts à la fois).` },
      { status: 400 }
    );
  }

  const { count } = await prisma.contact.updateMany({
    where: { id: { in: [...new Set(parsed.data.contactIds)] }, organizationId: session.organizationId },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });

  return NextResponse.json({ modifies: count });
}
