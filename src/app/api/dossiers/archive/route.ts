import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

/**
 * Clôturer ou rouvrir des dossiers — audit S7, P1 n°8.
 *
 * Deux portées, parce que le défaut signalé n'est pas « je veux fermer un
 * dossier » mais « la promotion 2022 reste dans toutes les listes pour
 * toujours ». Fermer trente dossiers un par un aurait été le même travail
 * pénible sous un autre nom.
 *
 *   { dossierIds: [...] }  — un dossier, ou quelques-uns
 *   { sessionId: "..." }   — toute la promotion d'un coup
 *
 * L'action est réversible dans les deux sens (`archived: false`), et ne
 * touche RIEN d'autre que ce champ : ni le BPF, ni l'accès de l'apprenant,
 * ni les factures. Voir lib/dossierArchive.ts pour la doctrine complète.
 */
const schema = z
  .object({
    archived: z.boolean(),
    dossierIds: z.array(z.string()).optional(),
    sessionId: z.string().optional(),
  })
  .refine((v) => Boolean(v.dossierIds?.length) !== Boolean(v.sessionId), {
    message: "Indiquez soit des dossiers, soit une session — pas les deux.",
  });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Champs invalides." }, { status: 400 });
  }
  const { archived, dossierIds, sessionId } = parsed.data;

  // Le filtre porte toujours organizationId : la portée par session ne doit
  // pas devenir un moyen de toucher les dossiers d'un autre organisme en
  // devinant un identifiant.
  const cible = sessionId
    ? { organizationId: session.organizationId, sessionId }
    : { organizationId: session.organizationId, id: { in: dossierIds ?? [] } };

  const resultat = await prisma.dossier.updateMany({
    where: cible,
    data: { archivedAt: archived ? new Date() : null },
  });

  return NextResponse.json({ ok: true, nombre: resultat.count, archived });
}
