import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import {
  QUESTIONNAIRE_CATEGORIE,
  QUESTIONNAIRE_TITRE,
  QUESTIONS_COMPETENCE,
  formaterQuestionnaire,
} from "@/lib/subcontractorQuestionnaire";

// La réponse de l'intervenant au questionnaire de compétence à l'entrée.
//
// L'invitation a pu déposer un BROUILLON (le questionnaire adressé, sans
// réponse). Répondre le complète plutôt que d'en créer un second : le
// dossier de l'intervenant doit contenir un questionnaire, pas deux, dont
// un vide. Voir lib/subcontractorQuestionnaire.ts pour le choix du support.

const schema = z.object({
  reponses: z.record(z.string(), z.string().max(4000)),
});

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const subcontractor = await prisma.subcontractor.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  // Réservé à l'intervenant lui-même : c'est une déclaration personnelle,
  // que l'organisme confronte ensuite aux justificatifs. Un membre de
  // l'équipe qui la remplirait à sa place produirait une preuve qui ne
  // prouve rien. Le lien est relu en base, jamais pris du client.
  if (subcontractor.linkedUserId === null || subcontractor.linkedUserId !== session.userId) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Réponses invalides." }, { status: 400 });

  // Seules les clés du questionnaire sont retenues : le corps de la requête
  // vient du navigateur, il n'a pas à décider quelles questions existent.
  const reponses: Record<string, string> = {};
  for (const q of QUESTIONS_COMPETENCE) {
    reponses[q.cle] = (parsed.data.reponses[q.cle] ?? "").trim();
  }
  if (Object.values(reponses).every((r) => r === "")) {
    return NextResponse.json({ error: "Répondez à au moins une question." }, { status: 400 });
  }

  const maintenant = new Date();
  const bodyText = formaterQuestionnaire({
    nomIntervenant: subcontractor.name,
    reponses,
    repondu: true,
    date: maintenant,
  });

  const existant = await prisma.document.findFirst({
    where: {
      organizationId: session.organizationId,
      subcontractorId: subcontractor.id,
      category: QUESTIONNAIRE_CATEGORIE,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  const document = existant
    ? await prisma.document.update({
        where: { id: existant.id },
        // "final" : le questionnaire rempli est une pièce du dossier, et
        // c'est ce statut que la checklist compte comme fournie.
        data: { bodyText, status: "final", title: `${QUESTIONNAIRE_TITRE} — ${subcontractor.name}` },
      })
    : await prisma.document.create({
        data: {
          organizationId: session.organizationId,
          subcontractorId: subcontractor.id,
          title: `${QUESTIONNAIRE_TITRE} — ${subcontractor.name}`,
          bodyText,
          category: QUESTIONNAIRE_CATEGORIE,
          status: "final",
        },
      });

  return NextResponse.json({ id: document.id }, { status: 201 });
}
