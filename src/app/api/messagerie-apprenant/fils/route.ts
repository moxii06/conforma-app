import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { calculerFermeture, estFerme } from "@/lib/messagerieApprenant";
import { Role } from "@prisma/client";

// Le volet gauche de « Mes échanges » : un fil par formation suivie.
//
// Réservé à l'apprenant, et c'est le point : côté organisme il n'y a rien à
// lister, le fil s'ouvre depuis la fiche dossier qu'on regarde déjà. Une
// route « tous les fils de l'organisme » n'aurait servi à personne et aurait
// ouvert une porte de plus sur les échanges de tous les apprenants.
//
// Un fil clos reste dans la liste, mais vide (voir la route des messages) :
// le faire disparaître aurait posé la question « où est passée ma
// conversation ? » sans jamais y répondre.
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (ctx.role !== Role.LEARNER) return NextResponse.json({ error: "Action réservée à l'apprenant." }, { status: 403 });

  const dossiers = await prisma.dossier.findMany({
    where: { organizationId: ctx.organizationId, learnerUserId: ctx.userId },
    select: {
      id: true,
      createdAt: true,
      accessDurationDays: true,
      firstAccessedAt: true,
      session: {
        select: {
          mode: true,
          endsAt: true,
          startsAt: true,
          trainer: { select: { name: true } },
          course: { select: { title: true } },
        },
      },
      learnerThread: { select: { id: true, lastMessageAt: true } },
    },
    // Un apprenant a une poignée de dossiers, pas des milliers : pas de
    // pagination ici, contrairement aux listes côté organisme.
    orderBy: { createdAt: "desc" },
  });

  // Le compte de non-lus, en une requête pour toute la liste. « Non lu » =
  // écrit par le camp d'en face (donc pas par moi) et jamais marqué —
  // exactement ce que porte LearnerMessage.luAt.
  const threadIds = dossiers.map((d) => d.learnerThread?.id).filter((id): id is string => Boolean(id));
  const nonLusParFil = new Map<string, number>();
  if (threadIds.length > 0) {
    const groupes = await prisma.learnerMessage.groupBy({
      by: ["threadId"],
      where: { threadId: { in: threadIds }, authorId: { not: ctx.userId }, luAt: null },
      _count: { _all: true },
    });
    for (const g of groupes) nonLusParFil.set(g.threadId, g._count._all);
  }

  const fils = dossiers.map((d) => {
    const closesAt = calculerFermeture(d.session, d);
    return {
      dossierId: d.id,
      titre: d.session.course.title,
      formateur: d.session.trainer?.name ?? null,
      // La date de session sert à distinguer deux inscriptions à la même
      // formation ; une formation en continu n'en a pas de significative.
      dateSession: d.session.mode === "ROLLING" ? null : d.session.startsAt,
      // Seul le VERDICT sort d'ici, pas la date : l'échéance elle-même est
      // affichée par le fil ouvert, qui la recalcule de son côté. La renvoyer
      // deux fois serait deux endroits à garder d'accord pour rien.
      ferme: estFerme(closesAt),
      nonLus: d.learnerThread ? (nonLusParFil.get(d.learnerThread.id) ?? 0) : 0,
      lastMessageAt: d.learnerThread?.lastMessageAt ?? null,
    };
  });

  // Les fils vivants d'abord, puis les plus récemment animés : un fil clos ou
  // jamais ouvert n'a rien à faire au-dessus d'une conversation en cours.
  fils.sort((a, b) => {
    if (a.ferme !== b.ferme) return a.ferme ? 1 : -1;
    const da = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const db = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return db - da;
  });

  return NextResponse.json({ fils });
}
