import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { importPermissionError, readImportFile, tooManyRowsError } from "@/lib/importFile";
import { parseBankStatementRows } from "@/lib/bankStatementImport";
import type { ImportMapping } from "@/lib/dataImport";

export const maxDuration = 60;

// Tier 1 of "rapprochement bancaire" (see schema.prisma's BankTransaction
// comment): reads a bank statement export, keeps only credit rows, and
// inserts them as pending BankTransaction rows for the "À valider" tab to
// suggest matches against. createMany + skipDuplicates does the dedup in
// one query rather than mapLimit-ing a per-row upsert — this route only
// ever inserts (no update-existing concept for a bank line the way
// contacts/courses import has), so there's nothing per-row to await.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Rôles effectifs : cumul compris (voir importPermissionError).
  const denied = importPermissionError(session.roles, "bank_transactions");
  if (denied) return denied;
  const { organizationId } = session;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  let mapping: ImportMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Paramètres d'import invalides." }, { status: 400 });
  }
  if (!mapping.date || !mapping.label || !mapping.credit) {
    return NextResponse.json({ error: "Les colonnes Date, Libellé et Montant reçu doivent être associées." }, { status: 400 });
  }

  const table = await readImportFile(formData);
  if (table instanceof NextResponse) return table;
  const tooMany = tooManyRowsError(table);
  if (tooMany) return tooMany;

  const { rows, errors } = parseBankStatementRows(organizationId, table, mapping);

  // skipDuplicates makes createMany's returned count reflect only the rows
  // actually inserted — re-uploading the same file honestly reports 0
  // nouvelles rather than claiming it (re-)imported everything.
  const { count: inserted } =
    rows.length > 0
      ? await prisma.bankTransaction.createMany({
          data: rows.map((r) => ({
            organizationId,
            source: "csv_import",
            externalId: r.externalId,
            bookedAt: r.bookedAt,
            amountCents: r.amountCents,
            label: r.label,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

  errors.sort((a, b) => a.line - b.line);
  return NextResponse.json({
    totalRows: table.rows.length,
    creditRowsFound: rows.length,
    imported: inserted,
    alreadyKnown: rows.length - inserted,
    errors,
  });
}
