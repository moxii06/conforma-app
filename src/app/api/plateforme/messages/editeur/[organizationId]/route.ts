import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";
import { ecrireFilPlateforme, lireFilPlateforme, NOM_EDITEUR } from "@/lib/messageriePlateforme";

// Le fil avec un organisme, côté ÉDITEUR (/plateforme).
//
// Segment `editeur/` explicite plutôt qu'un `[organizationId]` posé
// directement sous `messages/` : le bout organisme vit à côté, sous
// `organisme/`, et un segment statique voisin d'un segment dynamique au même
// niveau se lit mal — on ne devrait pas avoir à connaître les règles de
// priorité de Next.js pour savoir quelle route répond.
//
// Rappel utile : /api/plateforme est hors du matcher NextAuth (voir
// middleware.ts), parce que le propriétaire de la plateforme n'est un User
// d'aucun organisme. Le contrôle d'accès est donc ENTIÈREMENT ici.

async function organismeExistant(id: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  return Boolean(org);
}

export async function GET(request: Request, props: { params: Promise<{ organizationId: string }> }) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const params = await props.params;
  if (!(await organismeExistant(params.organizationId))) {
    return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });
  }

  const depuis = new URL(request.url).searchParams.get("depuis");
  const { messages } = await lireFilPlateforme(params.organizationId, "platform", depuis);
  return NextResponse.json({ messages });
}

const schema = z.object({ corps: z.string().min(1).max(LONGUEUR_MAX_MESSAGE) });

export async function POST(request: Request, props: { params: Promise<{ organizationId: string }> }) {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const params = await props.params;
  if (!(await organismeExistant(params.organizationId))) {
    return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message vide ou trop long." }, { status: 400 });
  const corps = parsed.data.corps.trim();
  if (!corps) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  const message = await ecrireFilPlateforme(params.organizationId, "platform", NOM_EDITEUR, corps);
  return NextResponse.json(message, { status: 201 });
}
