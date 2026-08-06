import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { MAX_AUTRES_CONTACTS_AFFICHES, filtreRecherche } from "@/lib/recipientSearch";

// Qui peut recevoir ce document.
//
// Groupé par provenance, la promotion d'abord : c'est le cas courant, et une
// liste à plat de tous les contacts de l'organisme obligerait à retrouver
// huit noms qu'on connaît déjà. Le dialogue pré-coche le premier groupe pour
// la même raison — décocher est plus rapide que cocher huit cases.
//
// Retour client : « s'il y a 300 apprenants, cela va être compliqué ». Il y
// avait pire qu'une liste longue : les autres contacts sortaient avec un
// `take: 200` muet, trié par nom. Au-delà, 3 800 personnes sur 4 000 étaient
// simplement INTROUVABLES, et rien ne le disait. La recherche se fait donc
// côté serveur, et ce qui est tronqué est annoncé.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  const doc = await prisma.document.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    select: { dossierId: true },
  });
  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  // Le document porte le dossier du premier inscrit ; c'est par sa session
  // qu'on retrouve toute la promotion, et par la formation de cette session
  // qu'on retrouve les autres promotions.
  const ancre = doc.dossierId
    ? await prisma.dossier.findUnique({
        where: { id: doc.dossierId },
        select: { sessionId: true, session: { select: { courseId: true, course: { select: { title: true } } } } },
      })
    : null;
  const sessionId = ancre?.sessionId ?? null;
  const courseId = ancre?.session?.courseId ?? null;

  const filtre = filtreRecherche(q);

  // La promotion en entier, sans plafond : c'est le lot auquel on envoie,
  // et un envoi partiel silencieux serait pire qu'une liste longue. La
  // recherche la filtre comme les autres groupes.
  const inscrits = sessionId
    ? await prisma.dossier.findMany({
        where: { sessionId, organizationId: auth.organizationId, ...(filtre ? { contact: filtre } : {}) },
        include: { contact: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Les apprenants des AUTRES sessions de la même formation. Ils étaient
  // absents : un règlement intérieur mis à jour ne partait qu'à la promotion
  // du document, jamais aux deux autres de l'année. Groupe distinct et non
  // fondu dans le premier — ce n'est pas la même promotion, et le dialogue
  // ne pré-coche que le premier groupe.
  const autresPromotions =
    courseId && sessionId
      ? await prisma.dossier.findMany({
          where: {
            organizationId: auth.organizationId,
            session: { courseId, id: { not: sessionId } },
            ...(filtre ? { contact: filtre } : {}),
          },
          include: {
            contact: { select: { firstName: true, lastName: true, email: true } },
            session: { select: { startsAt: true } },
          },
          orderBy: { createdAt: "desc" },
          take: MAX_AUTRES_CONTACTS_AFFICHES,
        })
      : [];

  const dejaVus = new Set([...inscrits, ...autresPromotions].map((d) => d.contactId));
  const oùAutres = {
    organizationId: auth.organizationId,
    id: { notIn: [...dejaVus] },
    ...(filtre ?? {}),
  };
  // Le total vient d'un count(), jamais de la longueur de la page : afficher
  // « 20 » quand il y en a 4 025 est pire que ne rien afficher.
  const [autres, totalAutres] = await Promise.all([
    prisma.contact.findMany({
      where: oùAutres,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
      take: MAX_AUTRES_CONTACTS_AFFICHES,
    }),
    prisma.contact.count({ where: oùAutres }),
  ]);

  const sousTraitants = await prisma.subcontractor.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { contactEmail: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    select: { id: true, name: true, contactEmail: true },
    orderBy: { name: "asc" },
  });

  const groups = [
    {
      titre: "Apprenants de cette session",
      // Le titre disait « de la formation » alors que la requête ne porte
      // que sur UNE session. Pour une formation donnée trois fois dans
      // l'année, c'était faux dans deux cas sur trois.
      aide: ancre?.session?.course?.title ?? null,
      membres: inscrits.map((d) => ({
        dossierId: d.id,
        contactId: d.contactId,
        name: `${d.contact.firstName} ${d.contact.lastName}`,
        email: d.contact.email,
      })),
      total: inscrits.length,
    },
    {
      titre: "Autres sessions de cette formation",
      aide: null,
      membres: autresPromotions.map((d) => ({
        dossierId: d.id,
        contactId: d.contactId,
        name: `${d.contact.firstName} ${d.contact.lastName}`,
        email: d.contact.email,
      })),
      total: autresPromotions.length,
    },
    {
      titre: "Autres contacts",
      aide: null,
      membres: autres.map((c) => ({
        dossierId: null,
        contactId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
      })),
      total: totalAutres,
    },
    {
      titre: "Sous-traitants et intervenants",
      aide: null,
      membres: sousTraitants.map((s) => ({ dossierId: null, contactId: null, name: s.name, email: s.contactEmail ?? "" })),
      total: sousTraitants.length,
    },
  ];

  return NextResponse.json({
    groups,
    // Ce que le dialogue a besoin de dire quand un groupe est vide : sans
    // formation rattachée, « Aucun apprenant » n'est pas une anomalie mais
    // la nature du document (un contrat de formateur, par exemple).
    rattacheAUneFormation: sessionId !== null,
    recherche: q,
  });
}
