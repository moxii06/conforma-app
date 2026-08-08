import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { cellFor, isValidEmail, parseLearnerCategory, splitFullName, type ImportMapping } from "@/lib/dataImport";
import { importPermissionError, readImportFile, tooManyRowsError, mapLimit } from "@/lib/importFile";
import { resolveEnrollmentSession, createDossier, EnrollmentError } from "@/lib/enrollment";

// Several queries per row, chunked — see importFile.ts. 60s is far above
// what MAX_IMPORT_ROWS needs, it's headroom for a cold Neon connection.
export const maxDuration = 60;

const optionsSchema = z.object({
  duplicates: z.enum(["skip", "update"]).default("skip"),
  // Optional "enroll everyone in this course" — a mapped per-row
  // "formation" column takes precedence for the rows where it's filled.
  courseId: z.string().optional(),
  sessionId: z.string().optional(),
});

type RowRecord = {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  category: string | null;
  courseTitle: string;
};

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Rôles effectifs : cumul compris (voir importPermissionError).
  const denied = importPermissionError(session.roles, "contacts");
  if (denied) return denied;
  const { organizationId } = session;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  let mapping: ImportMapping;
  let options: z.infer<typeof optionsSchema>;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}"));
    options = optionsSchema.parse(JSON.parse(String(formData.get("options") ?? "{}")));
  } catch {
    return NextResponse.json({ error: "Paramètres d'import invalides." }, { status: 400 });
  }
  if (!mapping.email) {
    return NextResponse.json({ error: "La colonne Email doit être associée — c'est elle qui évite les doublons." }, { status: 400 });
  }

  const table = await readImportFile(formData);
  if (table instanceof NextResponse) return table;
  const tooMany = tooManyRowsError(table);
  if (tooMany) return tooMany;

  const errors: { line: number; message: string }[] = [];
  const records: RowRecord[] = [];
  const seenEmails = new Map<string, number>();

  table.rows.forEach((row, i) => {
    const line = i + 2; // line 1 is the header row
    const email = cellFor(table, row, mapping, "email").toLowerCase();
    if (!email) {
      errors.push({ line, message: "Email manquant — ligne ignorée." });
      return;
    }
    if (!isValidEmail(email)) {
      errors.push({ line, message: `Email invalide (« ${email} ») — ligne ignorée.` });
      return;
    }
    const firstSeen = seenEmails.get(email);
    if (firstSeen !== undefined) {
      errors.push({ line, message: `Email en double dans le fichier (déjà ligne ${firstSeen}) — ligne ignorée.` });
      return;
    }
    seenEmails.set(email, line);

    let firstName = cellFor(table, row, mapping, "firstName");
    let lastName = cellFor(table, row, mapping, "lastName");
    if (!firstName && !lastName) {
      const full = cellFor(table, row, mapping, "fullName");
      if (full) ({ firstName, lastName } = splitFullName(full));
    }
    records.push({
      line,
      email,
      // Contact.firstName/lastName are required strings; the email local
      // part is a last-resort display name, editable later.
      firstName: firstName || (lastName ? "" : email.split("@")[0]),
      lastName: lastName || "",
      phone: cellFor(table, row, mapping, "phone"),
      companyName: cellFor(table, row, mapping, "company"),
      category: parseLearnerCategory(cellFor(table, row, mapping, "category")),
      courseTitle: cellFor(table, row, mapping, "courseTitle"),
    });
  });

  // -------------------------------------------------------------------------
  // Resolve shared referents ONCE (not per row): distinct companies, the
  // global course, distinct per-row course titles. Doing this before the
  // concurrent row pass also avoids two rows racing to create the same
  // company twice.
  const companyIdByName = new Map<string, string>();
  for (const name of new Set(records.map((r) => r.companyName).filter(Boolean))) {
    const existing = await prisma.company.findFirst({ where: { organizationId, name } });
    const company = existing ?? (await prisma.company.create({ data: { organizationId, name } }));
    companyIdByName.set(name, company.id);
  }

  let globalSession: { id: string; mode: string } | null = null;
  if (options.courseId) {
    try {
      globalSession = await resolveEnrollmentSession(organizationId, options.courseId, options.sessionId);
    } catch (e) {
      if (e instanceof EnrollmentError) {
        // needsSessionSelection (multi-session course) surfaces as 409 with
        // the session list so the dialog can show a picker and retry.
        return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
      }
      throw e;
    }
  }

  // Titles that matched no Course at all (as opposed to matching one but
  // failing session resolution, e.g. full/needs-picker below) — surfaced
  // separately so the dialog can offer to create exactly these, rather than
  // leaving the user to retype them into the course importer by hand.
  const missingCourseTitles: string[] = [];
  const sessionByTitle = new Map<string, { id: string; mode: string } | { rowError: string }>();
  for (const title of new Set(records.map((r) => r.courseTitle).filter(Boolean))) {
    const course = await prisma.course.findFirst({
      where: { organizationId, title: { equals: title, mode: "insensitive" } },
    });
    if (!course) {
      sessionByTitle.set(title, { rowError: `Formation introuvable : « ${title} » — contact importé sans inscription.` });
      missingCourseTitles.push(title);
      continue;
    }
    try {
      sessionByTitle.set(title, await resolveEnrollmentSession(organizationId, course.id));
    } catch (e) {
      if (e instanceof EnrollmentError) {
        sessionByTitle.set(title, { rowError: `« ${title} » : ${e.message} Contact importé sans inscription.` });
        continue;
      }
      throw e;
    }
  }

  const existingContacts = await prisma.contact.findMany({
    where: { organizationId, email: { in: records.map((r) => r.email) } },
    select: { id: true, email: true, defaultLearnerCategory: true },
  });
  const existingByEmail = new Map(existingContacts.map((c) => [c.email.toLowerCase(), c]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let enrolled = 0;
  let alreadyEnrolled = 0;

  await mapLimit(records, 8, async (record) => {
    try {
      const existing = existingByEmail.get(record.email);
      let contactId: string;
      let dossierCategory = record.category;

      if (existing) {
        if (options.duplicates === "update") {
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              // Only overwrite with real values — an unmapped or empty cell
              // must never blank out data the OF already has.
              ...(record.firstName ? { firstName: record.firstName } : {}),
              ...(record.lastName ? { lastName: record.lastName } : {}),
              ...(record.phone ? { phone: record.phone } : {}),
              ...(record.category ? { defaultLearnerCategory: record.category } : {}),
              ...(record.companyName ? { companyId: companyIdByName.get(record.companyName) } : {}),
            },
          });
          updated++;
        } else {
          skipped++;
        }
        contactId = existing.id;
        dossierCategory = record.category ?? existing.defaultLearnerCategory;
      } else {
        const contact = await prisma.contact.create({
          data: {
            organizationId,
            firstName: record.firstName,
            lastName: record.lastName,
            email: record.email,
            phone: record.phone || null,
            defaultLearnerCategory: record.category,
            companyId: record.companyName ? companyIdByName.get(record.companyName) : null,
          },
        });
        created++;
        contactId = contact.id;
      }

      // Enrollment: the per-row "formation" column wins over the global
      // course choice; "skip duplicates" still enrolls an existing contact
      // (skip is about not overwriting their data, not about ignoring them).
      let target: { id: string; mode: string } | null = null;
      if (record.courseTitle) {
        const resolved = sessionByTitle.get(record.courseTitle);
        if (resolved && "rowError" in resolved) {
          errors.push({ line: record.line, message: resolved.rowError });
        } else if (resolved) {
          target = resolved;
        }
      } else if (globalSession) {
        target = globalSession;
      }
      if (target) {
        try {
          await createDossier(organizationId, contactId, target, undefined, dossierCategory);
          enrolled++;
        } catch (e) {
          if (e instanceof EnrollmentError && e.status === 409) alreadyEnrolled++;
          else throw e;
        }
      }
    } catch (e) {
      console.error(`Import contact ligne ${record.line}:`, e);
      errors.push({ line: record.line, message: "Échec inattendu sur cette ligne." });
    }
  });

  errors.sort((a, b) => a.line - b.line);
  return NextResponse.json({
    totalRows: table.rows.length,
    created,
    updated,
    skipped,
    enrolled,
    alreadyEnrolled,
    errors,
    missingCourseTitles,
  });
}
