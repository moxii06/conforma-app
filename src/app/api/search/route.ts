import { NextResponse } from "next/server";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { requireSessionContext, can } from "@/lib/tenant";
import { borneAuxSiennesDuFormateur, borneAuxSiensDuCommercial } from "@/lib/proprieteRoles";
import { parseDateQuery } from "@/lib/searchQuery";

// Recherche globale (Ctrl/Cmd+K).
//
// Elle ne couvrait que deux entités — contacts et titres de formation — au
// motif que les autres « n'ont pas de nom propre ». C'est vrai d'une session
// (une formation à une date) et d'un dossier (un contact dans une session),
// mais faux de tout le reste : une facture a un numéro qu'on lit sur un
// relevé bancaire, un document a un titre, un prestataire a une raison
// sociale. Et pour ce qui n'a effectivement pas de nom, il y a une date —
// « 12/03 » est exactement ce qu'on tape pour retrouver une journée.
//
// Chaque groupe reprend le filtre d'appartenance de SA page : un rôle ne
// voit jamais ici plus que ce qu'il verrait sur l'écran correspondant. Le
// gate de groupe est le premier filtre, la clause ownership le second.
//
// « Reprendre le filtre de sa page » veut dire reprendre le MÊME calcul, pas
// une transcription : les clauses ci-dessous appellent lib/proprieteRoles.ts,
// comme /crm, /dossiers, /planning et /documents. Écrites ici à la main sur
// le rôle principal, elles ouvraient toute l'organisation à qui portait le
// rôle restrictif en casquette secondaire — la recherche globale étant
// précisément l'endroit où une telle fuite se voit le moins.

export type SearchResult = { id: string; label: string; sub?: string; href: string };
export type SearchGroup = { key: string; label: string; results: SearchResult[] };

const PAR_GROUPE = 5;

export async function GET(req: Request) {
  const { organizationId, role, roles, userId } = await requireSessionContext();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ groups: [] });

  const texte = { contains: q, mode: "insensitive" as const };
  const dateRange = parseDateQuery(q, new Date());
  // Une requête qui est une date n'est pas aussi un nom de contact : lancer
  // les deux ferait huit requêtes pour rien à chaque frappe.
  const cherchTexte = dateRange === null;

  // Les deux bornes de propriété, calculées une fois pour tous les groupes.
  const borneFormateur = borneAuxSiennesDuFormateur(roles);
  const borneCommercial = borneAuxSiensDuCommercial(roles);
  const trainerSessionFilter = borneFormateur ? { session: { trainerId: userId } } : {};

  const [contacts, dossiers, sessions, courses, invoices, quotes, documents, subcontractors] = await Promise.all([
    // Contacts — vers la fiche CRM, plus vers le dossier. Les deux existent
    // désormais comme résultats distincts : la fiche porte l'activité, les
    // emails et les documents d'envoi, que la fiche dossier n'a pas.
    // Rediriger la première vers la seconde la rendait inatteignable dès la
    // première inscription.
    cherchTexte && can(roles, "crm") !== "none"
      ? prisma.contact.findMany({
          where: {
            organizationId,
            ...(borneCommercial ? { opportunities: { some: { ownerId: userId } } } : {}),
            OR: [{ firstName: texte }, { lastName: texte }, { email: texte }, { phone: texte }],
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          take: PAR_GROUPE,
        })
      : [],

    // Dossiers — par le nom de l'apprenant ET par le titre de la formation,
    // ce que la liste /dossiers elle-même ne sait pas faire.
    cherchTexte && can(roles, "dossiers") !== "none"
      ? prisma.dossier.findMany({
          where: {
            organizationId,
            ...trainerSessionFilter,
            OR: [
              { contact: { OR: [{ firstName: texte }, { lastName: texte }, { email: texte }] } },
              { session: { course: { title: texte } } },
            ],
          },
          select: {
            id: true,
            contact: { select: { firstName: true, lastName: true } },
            session: { select: { startsAt: true, mode: true, course: { select: { title: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: PAR_GROUPE,
        })
      : [],

    // Sessions — par date quand la requête en est une, par titre de
    // formation ou par lieu sinon.
    can(roles, "planning") !== "none"
      ? prisma.session.findMany({
          where: {
            organizationId,
            ...(borneFormateur ? { trainerId: userId } : {}),
            ...(dateRange
              ? { startsAt: { gte: dateRange.from, lte: dateRange.to } }
              : { OR: [{ course: { title: texte } }, { location: texte }] }),
          },
          select: { id: true, startsAt: true, location: true, course: { select: { title: true } } },
          orderBy: { startsAt: "desc" },
          take: PAR_GROUPE,
        })
      : [],

    // Gate sur "planning" et non "courses" : les liens pointent vers
    // /formations/[id], l'écran de gestion, qui redirige un apprenant.
    cherchTexte && can(roles, "planning") !== "none"
      ? prisma.course.findMany({
          where: {
            organizationId,
            ...(borneFormateur
              ? {
                  OR: [
                    { sessions: { some: { trainerId: userId } } },
                    { subcontractors: { some: { linkedUserId: userId } } },
                    { responsibleUsers: { some: { id: userId } } },
                  ],
                }
              : {}),
            AND: [
              {
                OR: [
                  { title: texte },
                  { description: texte },
                  // Un OF cherche souvent sa formation par son code RS/RNCP,
                  // qui est ce qui figure sur le dossier de financement.
                  { certificationName: texte },
                  { certificationCode: texte },
                ],
              },
            ],
          },
          select: { id: true, title: true },
          take: PAR_GROUPE,
        })
      : [],

    cherchTexte && can(roles, "invoicing") !== "none"
      ? prisma.invoice.findMany({
          where: { organizationId, reference: texte },
          select: {
            id: true,
            reference: true,
            amountCents: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: PAR_GROUPE,
        })
      : [],

    cherchTexte && can(roles, "invoicing") !== "none"
      ? prisma.quote.findMany({
          where: { organizationId, reference: texte },
          select: {
            id: true,
            reference: true,
            amountCents: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: PAR_GROUPE,
        })
      : [],

    // Documents — sur le titre seul. bodyText contient le texte fusionné
    // complet des documents générés : y chercher remonterait un contrat de
    // vingt pages parce qu'il contient le mot tapé, ce qui noierait le
    // résultat réellement cherché.
    cherchTexte && can(roles, "toolkit") !== "none"
      ? prisma.document.findMany({
          where: {
            organizationId,
            archivedAt: null,
            title: texte,
            ...(borneFormateur ? { OR: [{ dossier: trainerSessionFilter }, { userId }] } : {}),
          },
          select: {
            id: true,
            title: true,
            category: true,
            dossierId: true,
            contactId: true,
            subcontractorId: true,
            userId: true,
            opportunity: { select: { contactId: true } },
          },
          orderBy: { createdAt: "desc" },
          take: PAR_GROUPE,
        })
      : [],

    // Prestataires — ADMIN_OF seul, comme /team.
    cherchTexte && can(roles, "team") === "full"
      ? prisma.subcontractor.findMany({
          where: { organizationId, OR: [{ name: texte }, { contactEmail: texte }, { siret: texte }] },
          select: { id: true, name: true, contactEmail: true, type: true },
          take: PAR_GROUPE,
        })
      : [],
  ]);

  const euros = (cents: number) => `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  const nom = (c: { firstName: string; lastName: string } | null) => (c ? `${c.firstName} ${c.lastName}` : null);

  const groups: SearchGroup[] = [
    {
      key: "contacts",
      label: "Contacts",
      results: contacts.map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName}`,
        sub: c.email ?? undefined,
        href: `/crm/contacts/${c.id}`,
      })),
    },
    {
      key: "dossiers",
      label: "Dossiers",
      results: dossiers.map((d) => ({
        id: d.id,
        label: `${d.contact.firstName} ${d.contact.lastName}`,
        sub: `${d.session.course.title} · ${d.session.mode === "ROLLING" ? "en continu" : format(d.session.startsAt, "d MMM yyyy", { locale: fr })}`,
        href: `/dossiers/${d.id}`,
      })),
    },
    {
      key: "sessions",
      label: "Sessions",
      results: sessions.map((s) => ({
        id: s.id,
        label: s.course.title,
        sub: [format(s.startsAt, "EEEE d MMMM yyyy", { locale: fr }), s.location].filter(Boolean).join(" · "),
        href: `/planning/${s.id}`,
      })),
    },
    {
      key: "courses",
      label: "Formations",
      results: courses.map((c) => ({ id: c.id, label: c.title, href: `/formations/${c.id}` })),
    },
    {
      key: "invoices",
      label: "Factures",
      results: invoices.map((i) => ({
        id: i.id,
        label: i.reference,
        sub: [nom(i.contact), euros(i.amountCents)].filter(Boolean).join(" · "),
        // Il n'existe pas de page par facture : on dépose sur la liste
        // filtrée sur cette référence, ce qui isole bien la ligne cherchée.
        href: `/facturation?tab=factures&ref=${encodeURIComponent(i.reference)}`,
      })),
    },
    {
      key: "quotes",
      label: "Devis",
      results: quotes.map((qt) => ({
        id: qt.id,
        label: qt.reference,
        sub: [nom(qt.contact), euros(qt.amountCents)].filter(Boolean).join(" · "),
        href: `/facturation?tab=devis&ref=${encodeURIComponent(qt.reference)}`,
      })),
    },
    {
      key: "documents",
      label: "Documents",
      results: documents.map((d) => ({ id: d.id, label: d.title, sub: d.category, href: documentHref(d) })),
    },
    {
      key: "subcontractors",
      label: "Prestataires",
      results: subcontractors.map((s) => ({
        id: s.id,
        label: s.name,
        sub: s.contactEmail ?? s.type,
        href: `/team/subcontractors/${s.id}`,
      })),
    },
  ];

  return NextResponse.json({ groups: groups.filter((g) => g.results.length > 0) });
}

/**
 * Un Document appartient à l'un de cinq propriétaires possibles, tous
 * nullables. On renvoie vers la fiche du propriétaire — c'est là qu'on agit
 * dessus (renvoyer, archiver, suivre la signature). Ouvrir le fichier
 * directement déclencherait un téléchargement depuis un résultat de
 * recherche, ce que personne n'attend d'un appui sur Entrée.
 */
function documentHref(d: {
  title: string;
  dossierId: string | null;
  contactId: string | null;
  subcontractorId: string | null;
  userId: string | null;
  opportunity: { contactId: string } | null;
}): string {
  if (d.dossierId) return `/dossiers/${d.dossierId}`;
  if (d.contactId) return `/crm/contacts/${d.contactId}?tab=documents`;
  if (d.opportunity) return `/crm/contacts/${d.opportunity.contactId}?tab=documents`;
  if (d.subcontractorId) return `/team/subcontractors/${d.subcontractorId}`;
  if (d.userId) return `/team/members/${d.userId}`;
  return `/documents?tab=mes-documents&q=${encodeURIComponent(d.title)}`;
}
