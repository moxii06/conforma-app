import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { resolveAppOrigin } from "@/lib/appUrl";
import { linkOrphanEmailsToKnownContacts } from "@/lib/mailboxMatching";
import { applyCompanyInfo, enrollmentCategorySchema } from "@/lib/enrollment";
import { PipelineStage } from "@prisma/client";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), contactId: z.string().min(1) }),
  // Audit P1 : mêmes champs que la création depuis le CRM
  // (/api/crm/opportunities, mode "new"), au même schéma partagé près —
  // seul l'email diffère, repris du message plutôt que saisi.
  z
    .object({
      action: z.literal("link-new"),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: z.string().optional(),
      label: z.string().optional(),
      amountCents: z.number().int().positive().optional(),
      courseOfInterestId: z.string().optional(),
    })
    .merge(enrollmentCategorySchema),
  z.object({ action: z.literal("discard") }),
  // L'inverse de « discard » — un message archivé par erreur redevient
  // triable. « discard » posait déjà ignoredAt sans jamais offrir de retour ;
  // ce n'était pas voulu comme un aller sans retour, seulement pas encore fait.
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("assign"), userId: z.string().min(1).nullable() }),
  // Confirmer ou écarter la suggestion de dossier calculée à la
  // synchronisation (voir mailboxMatching.ts). Le dossier CIBLE n'est jamais
  // pris depuis le corps de la requête — toujours relu depuis
  // suggestedDossierId en base — pour qu'un identifiant deviné ne puisse pas
  // rattacher un message au dossier de quelqu'un d'autre.
  z.object({ action: z.literal("confirm-dossier") }),
  z.object({ action: z.literal("reject-dossier") }),
]);

// Manual triage actions on one unsorted inbox message — spec §5.11 point 4:
// staff can create a new prospect, manually link to an existing contact, or
// discard. Point 5 (auto-purge unsorted messages after ~30 days) isn't
// implemented — there's no scheduled job runner in this scaffold; a real
// deployment needs a cron/worker to sweep `EmailMessage` rows with
// `contactId: null` past the retention window.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const message = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Action invalide." }, { status: 400 });

  if (parsed.data.action === "discard") {
    await prisma.emailMessage.update({ where: { id: message.id }, data: { ignoredAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "restore") {
    await prisma.emailMessage.update({ where: { id: message.id }, data: { ignoredAt: null } });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "confirm-dossier") {
    if (!message.suggestedDossierId) return NextResponse.json({ error: "Aucune suggestion à confirmer." }, { status: 400 });
    const dossier = await prisma.dossier.findFirst({
      where: { id: message.suggestedDossierId, organizationId: session.organizationId },
    });
    // La suggestion peut avoir été posée avant que le dossier ne soit
    // supprimé ou clôturé entre-temps — mieux vaut refuser proprement que
    // pointer sur un identifiant mort.
    if (!dossier) return NextResponse.json({ error: "Le dossier suggéré n'existe plus." }, { status: 404 });
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: { dossierId: dossier.id, suggestedDossierId: null, matchBasis: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "reject-dossier") {
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: { suggestedDossierId: null, matchBasis: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "assign") {
    if (parsed.data.userId === null) {
      const updated = await prisma.emailMessage.update({
        where: { id: message.id },
        data: { assignedToUserId: null, assignedToName: null },
      });
      return NextResponse.json(updated);
    }
    const member = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: session.organizationId },
    });
    if (!member) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    const updated = await prisma.emailMessage.update({
      where: { id: message.id },
      data: { assignedToUserId: member.id, assignedToName: member.name },
    });

    // Audit P1 : l'assignation ne faisait que poser une étiquette — la
    // personne visée n'apprenait rien. Elle reçoit maintenant un email, et
    // la tâche apparaît dans sa cloche et son « à faire » (voir le bloc
    // email_assigned de dashboardTasks.ts). S'assigner à soi-même
    // n'envoie rien : on sait déjà ce qu'on vient de faire.
    if (member.id !== session.userId) {
      const organization = await prisma.organization.findUniqueOrThrow({
        where: { id: session.organizationId },
        select: { name: true },
      });
      const assignedBy = session.name || session.email;
      const sender = message.fromName || message.fromAddress;
      try {
        await sendTransactionalEmail({
          to: member.email,
          toName: member.name,
          subject: `${organization.name} — un email vous a été assigné`,
          text:
            `Bonjour ${member.name},\n\n` +
            `${assignedBy} vous a assigné un email à traiter dans Jalon.\n\n` +
            `De : ${sender}\n` +
            `Objet : ${message.subject || "(sans objet)"}\n\n` +
            `Retrouvez-le dans votre boîte mail Jalon : ${resolveAppOrigin(request)}/inbox\n\n` +
            `À bientôt,\nL'équipe ${organization.name}`,
          senderName: organization.name,
        });
      } catch {
        // Non bloquant : l'assignation est enregistrée, et la tâche
        // apparaît de toute façon dans le « à faire » du destinataire.
      }
    }

    return NextResponse.json(updated);
  }

  let contactId: string;
  if (parsed.data.action === "link") {
    const contact = await prisma.contact.findFirst({
      where: { id: parsed.data.contactId, organizationId: session.organizationId },
    });
    if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    contactId = contact.id;
  } else {
    const data = parsed.data;
    const existing = await prisma.contact.findFirst({
      where: { organizationId: session.organizationId, email: message.fromAddress.toLowerCase() },
    });
    if (existing) {
      contactId = existing.id;
      if (data.learnerCategory) {
        await prisma.contact.update({ where: { id: contactId }, data: { defaultLearnerCategory: data.learnerCategory } });
      }
    } else {
      const created = await prisma.contact.create({
        data: {
          organizationId: session.organizationId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: message.fromAddress.toLowerCase(),
          phone: data.phone?.trim() || undefined,
          defaultLearnerCategory: data.learnerCategory || null,
        },
      });
      contactId = created.id;
    }

    // Même traitement de l'entreprise que côté CRM : rapproché par nom dans
    // l'organisation plutôt que dupliqué (voir applyCompanyInfo).
    if (data.company) {
      await applyCompanyInfo(session.organizationId, contactId, data.company);
    }

    let courseOfInterestId: string | undefined;
    if (data.courseOfInterestId) {
      const course = await prisma.course.findFirst({
        where: { id: data.courseOfInterestId, organizationId: session.organizationId },
      });
      if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
      courseOfInterestId = course.id;
    }

    // L'opportunité est ce qui fait exister le prospect dans le pipeline :
    // sans elle, « nouveau prospect » depuis la boîte mail ne créait qu'un
    // contact invisible côté CRM, à ressaisir. Rôle sans accès CRM : on
    // crée quand même le contact et on rattache l'email — le triage reste
    // son travail —, simplement sans opportunité.
    if (can(session.role, "crm") !== "none") {
      await prisma.opportunity.create({
        data: {
          organizationId: session.organizationId,
          contactId,
          label: data.label?.trim() || message.subject || "Demande entrante",
          amountCents: data.amountCents,
          stage: PipelineStage.PROSPECT,
          ownerId: session.userId,
          courseOfInterestId,
        },
      });
    }
  }

  const updated = await prisma.emailMessage.update({
    where: { id: message.id },
    data: { contactId, matchBasis: null, suggestedDossierId: null },
  });

  // Audit P1 : rattacher un email rattache aussi tout l'historique déjà
  // synchronisé de la même adresse — c'est la question du client (« si
  // j'échange plusieurs fois avec un apprenant et que je le rattache
  // après… »). Immédiat ici, plutôt que d'attendre la prochaine synchro
  // qui fait le même balayage.
  const linkedRetroactively = await linkOrphanEmailsToKnownContacts(session.organizationId);

  return NextResponse.json({ ...updated, linkedRetroactively });
}
