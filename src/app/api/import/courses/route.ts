import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { cellFor, parseHours, parsePriceCents, type ImportMapping } from "@/lib/dataImport";
import { importPermissionError, readImportFile, tooManyRowsError, mapLimit } from "@/lib/importFile";

export const maxDuration = 60;

const optionsSchema = z.object({
  duplicates: z.enum(["skip", "update"]).default("skip"),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const denied = importPermissionError(session.role, "courses");
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
  if (!mapping.title) {
    return NextResponse.json({ error: "La colonne Titre doit être associée." }, { status: 400 });
  }

  const table = await readImportFile(formData);
  if (table instanceof NextResponse) return table;
  const tooMany = tooManyRowsError(table);
  if (tooMany) return tooMany;

  const errors: { line: number; message: string }[] = [];
  const records: { line: number; title: string; description: string; durationHours: number | null; priceCents: number | null }[] = [];
  const seenTitles = new Map<string, number>();

  table.rows.forEach((row, i) => {
    const line = i + 2;
    const title = cellFor(table, row, mapping, "title");
    if (!title) {
      errors.push({ line, message: "Titre manquant — ligne ignorée." });
      return;
    }
    const key = title.toLowerCase();
    const firstSeen = seenTitles.get(key);
    if (firstSeen !== undefined) {
      errors.push({ line, message: `Titre en double dans le fichier (déjà ligne ${firstSeen}) — ligne ignorée.` });
      return;
    }
    seenTitles.set(key, line);
    records.push({
      line,
      title,
      description: cellFor(table, row, mapping, "description"),
      durationHours: parseHours(cellFor(table, row, mapping, "durationHours")),
      priceCents: parsePriceCents(cellFor(table, row, mapping, "priceEuros")),
    });
  });

  // Dedupe against the existing catalog by (case-insensitive) title — same
  // convergence idea as contacts-by-email: re-importing a catalog export
  // must not fork near-duplicate courses.
  const existingCourses = await prisma.course.findMany({
    where: { organizationId },
    select: { id: true, title: true },
  });
  const existingByTitle = new Map(existingCourses.map((c) => [c.title.toLowerCase(), c]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  await mapLimit(records, 8, async (record) => {
    try {
      const existing = existingByTitle.get(record.title.toLowerCase());
      if (existing) {
        if (options.duplicates === "update") {
          await prisma.course.update({
            where: { id: existing.id },
            data: {
              ...(record.description ? { description: record.description } : {}),
              ...(record.durationHours !== null ? { durationHours: record.durationHours } : {}),
              ...(record.priceCents !== null ? { priceCents: record.priceCents } : {}),
            },
          });
          updated++;
        } else {
          skipped++;
        }
        return;
      }
      await prisma.course.create({
        data: {
          organizationId,
          title: record.title,
          description: record.description || null,
          durationHours: record.durationHours,
          priceCents: record.priceCents,
        },
      });
      created++;
    } catch (e) {
      console.error(`Import formation ligne ${record.line}:`, e);
      errors.push({ line: record.line, message: "Échec inattendu sur cette ligne." });
    }
  });

  errors.sort((a, b) => a.line - b.line);
  return NextResponse.json({ totalRows: table.rows.length, created, updated, skipped, errors });
}
