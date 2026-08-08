import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { marquerDevisEnvoye, marquerDevisSigne } from "@/lib/quoteStatus";
import { checkLines } from "@/lib/invoiceLines";

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
    // Le détail, quand il est envoyé, REMPLACE l'ancien en entier — un
    // rapiéçage ligne à ligne demanderait des identifiants stables côté
    // client pour un gain nul : le détail se saisit d'un bloc.
    lines: z
      .array(
        z.object({
          designation: z.string().min(1).max(300),
          quantity: z.number().positive(),
          unitPriceCents: z.number().int().min(0),
          unit: z.string().max(40).optional(),
        }),
      )
      .max(50)
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Rien à modifier." });

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "invoicing") === "none") {
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
  // Le détail seul est une modification à part entière : il compte dans cette
  // condition, sans quoi un PATCH ne portant que des lignes serait accepté et
  // silencieusement sans effet.
  if (Object.keys(contenu).length > 0 || parsed.data.lines !== undefined) {
    if (quote.status !== DocStatus.DRAFT) {
      return NextResponse.json(
        { error: "Ce devis est déjà parti chez le client — il ne peut plus être modifié." },
        { status: 409 },
      );
    }
    const montantFinal = parsed.data.amountCents ?? quote.amountCents;

    if (parsed.data.lines !== undefined) {
      // Détail fourni : il fait foi avec le montant, et la même règle qu'à la
      // création s'applique — la somme doit tomber exactement dessus. Zéro
      // tolérance, c'est l'écart d'un centime que relève un OPCO.
      const verif = checkLines(parsed.data.lines, montantFinal);
      if (!verif.ok) return NextResponse.json({ error: verif.error }, { status: 400 });
      await prisma.quoteLine.deleteMany({ where: { quoteId: quote.id } });
      if (parsed.data.lines.length > 0) {
        await prisma.quoteLine.createMany({
          data: parsed.data.lines.map((l, i) => ({ ...l, quoteId: quote.id, order: i })),
        });
      }
    } else if (parsed.data.amountCents !== undefined && parsed.data.amountCents !== quote.amountCents) {
      // Montant seul, sur un devis qui porte déjà un détail : l'écrire ferait
      // diverger le total de sa propre grille. On refuse plutôt que de
      // produire un PDF qui se contredit.
      const lignes = await prisma.quoteLine.count({ where: { quoteId: quote.id } });
      if (lignes > 0) {
        return NextResponse.json(
          { error: "Ce devis a un détail ligne par ligne — envoyez aussi le détail, ou corrigez-le depuis la Facturation." },
          { status: 409 },
        );
      }
    }
    if (Object.keys(contenu).length > 0) {
      await prisma.quote.update({ where: { id: quote.id }, data: contenu });
    }
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
  if (can(session.roles, "invoicing") === "none") {
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
