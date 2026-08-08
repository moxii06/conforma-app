import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { resolveAppOrigin } from "@/lib/appUrl";
import {
  QUESTIONNAIRE_CATEGORIE,
  QUESTIONNAIRE_TITRE,
  formaterQuestionnaire,
  questionnaireEnTexte,
} from "@/lib/subcontractorQuestionnaire";

const schema = z.object({
  role: z.nativeEnum(Role).default(Role.TRAINER),
  /** Mot d'accompagnement rédigé par l'organisme, en plus du texte d'invitation. */
  message: z.string().max(4000).optional(),
  /** Joindre le questionnaire de compétence à l'entrée (Qualiopi, indicateur 21). */
  joindreQuestionnaire: z.boolean().optional(),
});

// Client feedback: flagging a subcontractor as a formateur should let them
// become assignable to a session like any other trainer. Rather than
// teaching every trainer-picker in the app about a second "or a
// subcontractor" source, this creates a real platform User — same flow as
// /api/team/invite — and links it back via Subcontractor.linkedUserId.
// Once linked, they show up in every existing TRAINER query immediately
// (status "invited" is enough; they don't need to have logged in yet).
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const subcontractor = await prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!subcontractor) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  if (subcontractor.linkedUserId) return NextResponse.json({ error: "Ce prestataire a déjà un compte." }, { status: 409 });
  if (!subcontractor.contactEmail) return NextResponse.json({ error: "Renseignez d'abord un email de contact." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

  const email = subcontractor.contactEmail.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });

  const activationToken = randomBytes(20).toString("hex");
  const member = await prisma.user.create({
    data: {
      organizationId: session.organizationId,
      name: subcontractor.name,
      email,
      role: parsed.data.role,
      status: "invited",
      activationToken,
    },
  });

  await prisma.subcontractor.update({ where: { id: subcontractor.id }, data: { linkedUserId: member.id } });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const origine = resolveAppOrigin(request);
  const activationUrl = `${origine}/activation/${activationToken}`;
  const lienPieces = `${origine}/team/mes-pieces`;

  // Le questionnaire est déposé en BROUILLON au moment de l'invitation, pas
  // à la réponse : c'est ce qui rend « adressé, sans retour » visible sur la
  // fiche de l'intervenant. Un brouillon ne coche pas la checklist (voir
  // construireChecklist), donc la pièce reste due tant que personne n'a
  // répondu — l'inverse aurait affiché « fournie » un questionnaire vide.
  if (parsed.data.joindreQuestionnaire) {
    await prisma.document.create({
      data: {
        organizationId: session.organizationId,
        subcontractorId: subcontractor.id,
        title: `${QUESTIONNAIRE_TITRE} — ${subcontractor.name}`,
        category: QUESTIONNAIRE_CATEGORIE,
        status: "draft",
        bodyText: formaterQuestionnaire({
          nomIntervenant: subcontractor.name,
          reponses: {},
          repondu: false,
          date: new Date(),
        }),
      },
    });
  }

  // Le texte figé d'origine reste le socle — il porte l'action à faire
  // (activer le compte). Le mot de l'organisme s'insère AVANT : c'est lui
  // qui explique pourquoi cette invitation arrive, et il ne doit pas se
  // retrouver après le lien, là où personne ne lit plus.
  const motPersonnalise = parsed.data.message?.trim();
  const blocQuestionnaire = parsed.data.joindreQuestionnaire
    ? `\n\nAvant votre première intervention, merci de renseigner ce questionnaire de compétence depuis votre espace (${lienPieces}) :\n\n${questionnaireEnTexte()}\n\nVous pourrez y déposer au même endroit les pièces justificatives attendues (contrat, qualification, attestations).`
    : `\n\nVous pourrez déposer vos pièces justificatives (contrat, qualification, attestations) depuis votre espace : ${lienPieces}`;

  const texte =
    `Bonjour ${member.name},\n\n` +
    (motPersonnalise ? `${motPersonnalise}\n\n` : "") +
    `${session.name || session.email} vous invite à rejoindre l'espace ${organization.name} sur Jalon.\n\n` +
    `Activez votre compte ici : ${activationUrl}` +
    blocQuestionnaire +
    `\n\nÀ bientôt,\nL'équipe ${organization.name}`;

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: member.email,
      toName: member.name,
      subject: `Invitation à rejoindre ${organization.name} sur Jalon`,
      text: texte,
      senderName: organization.name,
      replyTo: session.email,
    });
    emailSent = true;
  } catch {
    // Fall through — activationUrl is still returned below for manual relay.
  }

  return NextResponse.json({ id: member.id, email: member.email, activationUrl, emailSent }, { status: 201 });
}
