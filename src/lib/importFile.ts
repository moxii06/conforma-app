import { NextResponse } from "next/server";
import { can } from "@/lib/tenant";
import { parseDelimited, type ImportKind, type ParsedTable } from "@/lib/dataImport";
import { parseXlsx, XlsxError } from "@/lib/xlsxRead";
import type { Role } from "@prisma/client";

// Server-side helpers shared by the three /api/import/* routes (analyze,
// contacts, courses) — kept out of the route files themselves because Next
// only allows HTTP-method exports there.

export const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;

// Same permission story as the rest of the app: contacts import is a CRM
// write, courses import is a catalog write, bank statement import is a
// facturation write. La reprise d'historique écrit des sessions, des
// dossiers ET des factures payées : elle exige les deux droits, pas un
// seul — voir /api/import/history, qui refait la vérification côté écriture.
export function importPermissionError(role: Role, kind: ImportKind): NextResponse | null {
  const refus = NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  if (kind === "history") {
    return can(role, "invoicing") === "full" && can(role, "courses") === "full" ? null : refus;
  }
  const feature = kind === "contacts" ? "crm" : kind === "courses" ? "courses" : "invoicing";
  return can(role, feature) === "full" ? null : refus;
}

// French CRM/Excel exports are frequently Windows-1252, not UTF-8. Try
// strict UTF-8 first (fatal:true throws on invalid bytes), fall back to
// windows-1252 — the reverse guess would silently mangle every accent.
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function readImportFile(formData: FormData): Promise<ParsedTable | NextResponse> {
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis (.csv ou .xlsx)." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (4 Mo maximum) — découpez-le en plusieurs fichiers." },
      { status: 400 }
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    // ZIP magic bytes — catches .xlsx files renamed or served with a generic type.
    (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b);

  try {
    if (isXlsx) return parseXlsx(bytes);
    return parseDelimited(decodeText(bytes));
  } catch (e) {
    if (e instanceof XlsxError) {
      return NextResponse.json(
        { error: `${e.message} Essayez d'enregistrer le fichier au format CSV depuis votre tableur.` },
        { status: 400 }
      );
    }
    console.error("Import parse error:", e);
    return NextResponse.json({ error: "Impossible de lire ce fichier." }, { status: 400 });
  }
}

// Serverless-timeout guard: the commit routes run several queries per row
// (chunked, concurrency-limited) — 1000 rows stays comfortably inside the
// 60s maxDuration both commit routes declare. Beyond that, ask the user to
// split the file rather than half-import and time out.
export const MAX_IMPORT_ROWS = 1000;

export function tooManyRowsError(table: ParsedTable): NextResponse | null {
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `Fichier trop long (${table.rows.length} lignes) — limite de ${MAX_IMPORT_ROWS} lignes par import. Découpez-le en plusieurs fichiers.` },
      { status: 400 }
    );
  }
  return null;
}

// Small concurrency-limited runner: sequential awaits over hundreds of rows
// would blow the serverless time budget; unbounded Promise.all would hammer
// the database pool. Results keep input order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
