import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";
import {
  resolveContact,
  resolveEnrollmentSession,
  createDossier,
  assertCourseHasRoom,
  EnrollmentError,
} from "@/lib/enrollment";

const schema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(180),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(160).optional(),
  message: z.string().max(2000).optional(),
  // Qualiopi indicator 26 territory: the public page already states that
  // accommodations are possible, so the form has to give somewhere to say
  // it. Stored on the message, not as a structured accommodation request —
  // that record belongs to a dossier, which doesn't exist yet at this point.
  needsAccommodation: z.boolean().optional(),
  // Honeypot. Real people never see this field; bots fill everything.
  // Accepts any value on purpose — rejecting it here would return a 400 and
  // tell the bot it was caught. It's read *after* validation instead, and
  // the request is then accepted and dropped.
  website: z.string().max(200).optional(),
  sessionId: z.string().optional(),
});

// Same-email, same-course submissions inside this window are treated as the
// visitor clicking twice, not as two separate leads.
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// The public page's call to action. Unauthenticated by design — the access
// control is the course being published (isPublic) AND the OF having opted
// into a mode (publicEnrollment). Both are per-course decisions made by an
// admin, so a course is never reachable here by accident.
export async function POST(request: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Vérifiez les champs du formulaire." }, { status: 400 });
  }

  // Silently accept and drop: telling a bot it was detected just teaches it
  // to fill the field differently next time.
  if (parsed.data.website) return NextResponse.json({ ok: true }, { status: 201 });

  const course = await prisma.course.findFirst({
    where: { id: params.courseId, isPublic: true, archivedAt: null },
    include: { organization: { select: { name: true, publicContactEmail: true } } },
  });
  if (!course || course.publicEnrollment === "none") {
    return NextResponse.json({ error: "Cette formation n'accepte pas les inscriptions en ligne." }, { status: 404 });
  }

  const { firstName, lastName, email, phone, companyName, message, needsAccommodation } = parsed.data;
  const notes = [
    message?.trim() || null,
    needsAccommodation ? "A signalé un besoin d'aménagement (situation de handicap)." : null,
    companyName?.trim() ? `Société indiquée : ${companyName.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const contact = await resolveContact(course.organizationId, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
    });

    if (course.publicEnrollment === "direct") {
      await assertCourseHasRoom(course.organizationId, course);
      const session = await resolveEnrollmentSession(course.organizationId, course.id, parsed.data.sessionId);
      await createDossier(course.organizationId, contact.id, session);
    } else {
      // "request": a lead for staff to qualify, nothing committed. Deduped so
      // a double-click (or a visitor coming back the same day) doesn't create
      // two prospects to sort out by hand.
      const recent = await prisma.opportunity.findFirst({
        where: {
          organizationId: course.organizationId,
          contactId: contact.id,
          courseOfInterestId: course.id,
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
      });
      if (!recent) {
        await prisma.opportunity.create({
          data: {
            organizationId: course.organizationId,
            contactId: contact.id,
            label: `Demande d'inscription — ${course.title}`,
            courseOfInterestId: course.id,
            amountCents: course.priceCents ?? null,
          },
        });
      }
    }

    await notifyOrganization(course, contact, notes);
    return NextResponse.json({ ok: true, mode: course.publicEnrollment }, { status: 201 });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

// Best-effort: the CRM row (or the dossier) is the record, the email is only
// how staff find out sooner. A failed send must not fail the visitor's
// submission — from their side the request went through, and it did.
async function notifyOrganization(
  course: { title: string; publicEnrollment: string; organization: { name: string; publicContactEmail: string | null } },
  contact: { firstName: string; lastName: string; email: string; phone: string | null },
  notes: string,
) {
  const to = course.organization.publicContactEmail;
  if (!to || !isBrevoConfigured()) return;
  const isDirect = course.publicEnrollment === "direct";
  try {
    await sendTransactionalEmail({
      to,
      senderName: course.organization.name,
      subject: isDirect
        ? `Nouvelle inscription en ligne — ${course.title}`
        : `Nouvelle demande d'inscription — ${course.title}`,
      text: [
        isDirect
          ? `${contact.firstName} ${contact.lastName} vient de s'inscrire à « ${course.title} » depuis votre fiche publique.`
          : `${contact.firstName} ${contact.lastName} demande à s'inscrire à « ${course.title} ».`,
        "",
        `Email : ${contact.email}`,
        contact.phone ? `Téléphone : ${contact.phone}` : "",
        notes ? `\n${notes}` : "",
        "",
        isDirect
          ? "Le dossier a été créé. Retrouvez-le dans Dossiers apprenants."
          : "Le prospect a été créé dans votre CRM commercial.",
      ]
        .filter(Boolean)
        .join("\n"),
      replyTo: contact.email,
    });
  } catch {
    // Deliberately swallowed — see the note above.
  }
}
