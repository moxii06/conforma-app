import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { marquerDevisEnvoye, marquerDevisSigne } from "@/lib/quoteStatus";

// Deux usages dans un seul verbe : franchir un jalon (status), ou corriger
// le contenu du devis. Ils ne se mélangent pas — un envoi ne modifie pas le
// montant, une correction ne fait pas avancer l'affaire — mais tous deux
// sont bien un « modifier ce devis », d'où la même route.
const schema = z
  .object({
    status: z.nativeEnum(DocStatus).optional(),
    reference: z.string().min(1).max(60).optional(),
    description: z.string().max(300).nullable().optional(),
    amountCents: z.number().int().positive().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Rien à modifier." });

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });

  const quote = await prisma.quote.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!quote) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  // Sending or signing a quote are real pipeline milestones — advance the
  // matching CRM opportunity automatically so it reflects it without
  // someone having to remember to also click the stage dropdown over there
  // (client feedback: signing a quote had no effect on the CRM at all).
  //
  // Ces deux jalons vivent dans lib/quoteStatus.ts parce que l'envoi d'un
  // devis se déclenche aussi depuis la fiche prospect, en pièce jointe :
  // deux écrans, une seule règle.
  if (parsed.data.status === "SENT") {
    await marquerDevisEnvoye(session.organizationId, quote);
  } else if (parsed.data.status === "SIGNED") {
    await marquerDevisSigne(session.organizationId, quote);
  } else if (parsed.data.status) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: parsed.data.status } });
  }

  // La correction du contenu, s'il y en a une. Refusée sur un devis déjà
  // parti : le client détient un PDF avec ce montant, en changer la valeur
  // ici ferait diverger sa copie de la nôtre sans que personne le sache.
  const contenu = {
    ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.amountCents !== undefined ? { amountCents: parsed.data.amountCents } : {}),
  };
  if (Object.keys(contenu).length > 0) {
    if (quote.status !== DocStatus.DRAFT) {
      return NextResponse.json(
        { error: "Ce devis est déjà parti chez le client — il ne peut plus être modifié." },
        { status: 409 },
      );
    }
    await prisma.quote.update({ where: { id: quote.id }, data: contenu });
  }

  const updated = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  return NextResponse.json(updated);
}

// Supprimer un devis — reserve a ceux qui n'ont jamais quitte l'organisme.
//
// Un devis envoye est un fait commercial : le prospect en detient une copie,
// et l'affaire a pu avancer a « Devis envoye » a cause de lui. L'effacer
// laisserait une etape sans cause. Un brouillon, lui, n'engage rien — c'est
// le cas qu'on veut couvrir : un devis cree par erreur dans le composeur.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const quote = await prisma.quote.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!quote) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });
  if (quote.status !== DocStatus.DRAFT) {
    return NextResponse.json(
      { error: "Ce devis est déjà parti chez le client — il ne peut plus être supprimé." },
      { status: 409 },
    );
  }

  await prisma.quote.delete({ where: { id: quote.id } });
  return NextResponse.json({ ok: true });
}
