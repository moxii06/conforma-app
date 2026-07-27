import { createHash } from "crypto";
import { cellFor, parseBankDate, parseSignedAmountCents, type ImportMapping, type ParsedTable } from "@/lib/dataImport";

// Server-only half of the CSV bank-statement import (tier 1 of
// "rapprochement bancaire" — see bankReconciliation.ts for the matching
// half and gocardless.ts for tier 2, the live connector). Turns mapped CSV
// rows into the same shape BankTransaction rows need, keeping only credits
// (incoming money) since those are the only ones ever worth suggesting
// against an open invoice.

export type ParsedBankRow = {
  line: number;
  bookedAt: Date;
  amountCents: number;
  label: string;
  externalId: string;
};

// A GoCardless-synced transaction gets its externalId straight from the
// provider (real, globally unique). A CSV row has no such id, so one is
// derived from its own content — stable enough that re-uploading the exact
// same file produces the exact same ids (caught by BankTransaction's
// unique constraint, so nothing gets duplicated), but an intra-file
// occurrence counter still tells apart two genuinely identical-looking
// rows (same date/amount/label) in a single file rather than silently
// dropping the second one as a false "duplicate".
function baseHash(organizationId: string, bookedAt: Date, amountCents: number, label: string): string {
  return createHash("sha256")
    .update(`${organizationId}|csv|${bookedAt.toISOString().slice(0, 10)}|${amountCents}|${label}`)
    .digest("hex")
    .slice(0, 32);
}

export function parseBankStatementRows(
  organizationId: string,
  table: ParsedTable,
  mapping: ImportMapping
): { rows: ParsedBankRow[]; errors: { line: number; message: string }[] } {
  const errors: { line: number; message: string }[] = [];
  const rows: ParsedBankRow[] = [];
  const occurrences = new Map<string, number>();

  table.rows.forEach((row, i) => {
    const line = i + 2; // line 1 is the header row
    const dateRaw = cellFor(table, row, mapping, "date");
    const label = cellFor(table, row, mapping, "label");
    const amountRaw = cellFor(table, row, mapping, "credit");

    const bookedAt = parseBankDate(dateRaw);
    if (!bookedAt) {
      errors.push({ line, message: `Date illisible (« ${dateRaw} ») — ligne ignorée.` });
      return;
    }
    const amountCents = parseSignedAmountCents(amountRaw);
    if (amountCents === null) {
      errors.push({ line, message: "Montant illisible — ligne ignorée." });
      return;
    }
    if (amountCents <= 0) {
      // A débit (negative, or a genuinely zero row) — not an incoming
      // payment, silently skipped rather than reported as an "error": most
      // bank exports have far more debit lines than credit ones, and
      // flagging every one would bury the real errors above.
      return;
    }
    if (!label) {
      errors.push({ line, message: "Libellé manquant — ligne ignorée." });
      return;
    }

    const base = baseHash(organizationId, bookedAt, amountCents, label);
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);

    rows.push({ line, bookedAt, amountCents, label, externalId: occurrence === 1 ? base : `${base}-${occurrence}` });
  });

  return { rows, errors };
}
