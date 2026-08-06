import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { appliquerStatutFacture } from "@/lib/invoiceStatus";
import { checkLines } from "@/lib/invoiceLines";

// Deux usages dans un seul verbe : franchir un jalon (status), ou corriger le
// contenu de la facture. Même construction que la route devis voisine — un
// envoi ne modifie pas le montant, une correction ne change pas le statut —
// mais tous deux sont bien un « modifier cette facture ».
const schema = z
  .object({
    status: z.nativeEnum(DocStatus).optional(),
    reference: z.string().min(1).max(60).optional(),
    description: z.string().max(300).nullable().optional(),
    amountCents: z.number().int().positive().optional(),
    dueDate: z.string().optional(),
    // Le détail, quand il est envoyé, REMPLACE l'ancien en entier.
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
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  if (parsed.data.status) {
    // La transition vit dans lib/invoiceStatus.ts : le changement en masse
    // fait le même geste, et deux copies auraient fini par diverger.
    const ok = await appliquerStatutFacture(session.organizationId, invoice.id, parsed.data.status);
    if (!ok) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  // La correction du contenu, s'il y en a une.
  //
  // Refusée dès que la facture a quitté le brouillon, et la règle est ici plus
  // dure que pour un devis : une facture émise est une pièce comptable. Le
  // client en détient un exemplaire, elle peut être partie chez
  // l'expert-comptable, et l'article L123-22 du code de commerce veut une
  // écriture inaltérable. On ne corrige pas une facture émise — on émet un
  // avoir.
  const contenu = {
    ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.amountCents !== undefined ? { amountCents: parsed.data.amountCents } : {}),
    ...(parsed.data.dueDate !== undefined ? { dueDate: new Date(parsed.data.dueDate) } : {}),
  };
  // Le détail seul est une modification à part entière : il compte dans cette
  // condition, sans quoi un PATCH ne portant que des lignes serait accepté et
  // silencieusement sans effet.
  if (Object.keys(contenu).length > 0 || parsed.data.lines !== undefined) {
    if (invoice.status !== DocStatus.DRAFT) {
      return NextResponse.json(
        { error: "Cette facture est déjà émise — elle ne peut plus être modifiée. Il faut passer par un avoir." },
        { status: 409 },
      );
    }
    if (parsed.data.dueDate !== undefined && Number.isNaN(new Date(parsed.data.dueDate).getTime())) {
      return NextResponse.json({ error: "Échéance invalide." }, { status: 400 });
    }
    const montantFinal = parsed.data.amountCents ?? invoice.amountCents;

    if (parsed.data.lines !== undefined) {
      // Détail fourni : la même règle qu'à la création — la somme doit tomber
      // exactement sur le montant. Zéro tolérance, c'est l'écart d'un centime
      // que relève un OPCO.
      const verif = checkLines(parsed.data.lines, montantFinal);
      if (!verif.ok) return NextResponse.json({ error: verif.error }, { status: 400 });
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      if (parsed.data.lines.length > 0) {
        await prisma.invoiceLine.createMany({
          data: parsed.data.lines.map((l, i) => ({ ...l, invoiceId: invoice.id, order: i })),
        });
      }
    } else if (parsed.data.amountCents !== undefined && parsed.data.amountCents !== invoice.amountCents) {
      // Montant seul, sur une facture qui porte déjà un détail : l'écrire
      // ferait diverger le total de sa propre grille.
      const lignes = await prisma.invoiceLine.count({ where: { invoiceId: invoice.id } });
      if (lignes > 0) {
        return NextResponse.json(
          { error: "Cette facture a un détail ligne par ligne — envoyez aussi le détail, ou corrigez-le depuis la Facturation." },
          { status: 409 },
        );
      }
    }
    if (Object.keys(contenu).length > 0) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: contenu });
    }
  }

  const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  return NextResponse.json(updated);
}

// Pas de DELETE, et c'est délibéré.
//
// nextInvoiceReference alloue le numéro par incrément atomique du compteur de
// l'organisme. Effacer une facture ne rend pas son numéro : elle laisse un
// trou dans une séquence que l'article 242 nonies A du CGI exige chronologique
// et continue. Le trou ne se voit nulle part dans l'application, et se paie à
// l'inspection. Une facture de trop se retire du message qu'elle accompagnait,
// puis se traite en Facturation — c'est là qu'est le métier.
