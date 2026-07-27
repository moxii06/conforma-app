import { describe, expect, it } from "vitest";
import { parseDelimited, suggestMapping } from "./dataImport";
import { parseBankStatementRows } from "./bankStatementImport";

// The dedup id is the whole safety net against re-uploading the same
// relevé twice and double-counting a payment — worth its own coverage,
// separate from the CSV-parsing tests in dataImport.test.ts.

describe("parseBankStatementRows", () => {
  it("keeps only credit rows from a signed-amount French export, dropping débits", () => {
    const csv = [
      "Date;Libellé;Montant",
      "15/06/2026;VIR SEPA JEAN DUPONT;900,00",
      "16/06/2026;PRELEVEMENT EDF;-45,20",
      "17/06/2026;VIR SEPA ACME CONSEIL;1 200,50",
    ].join("\n");
    const table = parseDelimited(csv);
    const mapping = suggestMapping(table.headers, "bank_transactions");
    const { rows, errors } = parseBankStatementRows("org-1", table, mapping);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amountCents: 90000, label: "VIR SEPA JEAN DUPONT" });
    expect(rows[1]).toMatchObject({ amountCents: 120050, label: "VIR SEPA ACME CONSEIL" });
    expect(errors).toHaveLength(0);
  });

  it("parses ISO dates too, not just DD/MM/YYYY", () => {
    const csv = ["Date;Libellé;Montant", "2026-06-15;VIR TEST;500,00"].join("\n");
    const table = parseDelimited(csv);
    const mapping = suggestMapping(table.headers, "bank_transactions");
    const { rows } = parseBankStatementRows("org-1", table, mapping);
    expect(rows[0].bookedAt.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("reports an unreadable date or amount as an error rather than silently dropping it", () => {
    const csv = ["Date;Libellé;Montant", "pas une date;VIR TEST;500,00", "15/06/2026;VIR TEST 2;pas un montant"].join("\n");
    const table = parseDelimited(csv);
    const mapping = suggestMapping(table.headers, "bank_transactions");
    const { rows, errors } = parseBankStatementRows("org-1", table, mapping);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toMatch(/Date illisible/);
    expect(errors[1].message).toMatch(/Montant illisible/);
  });

  it("produces the exact same externalIds for the exact same file, so a re-import is fully deduplicated by the DB", () => {
    const csv = ["Date;Libellé;Montant", "15/06/2026;VIR SEPA JEAN DUPONT;900,00"].join("\n");
    const table = parseDelimited(csv);
    const mapping = suggestMapping(table.headers, "bank_transactions");
    const first = parseBankStatementRows("org-1", table, mapping);
    const second = parseBankStatementRows("org-1", table, mapping);
    expect(first.rows[0].externalId).toBe(second.rows[0].externalId);
  });

  it("gives two genuinely identical-looking rows in the SAME file distinct externalIds, instead of merging them into one", () => {
    const csv = [
      "Date;Libellé;Montant",
      "15/06/2026;VIR SEPA JEAN DUPONT;900,00",
      "15/06/2026;VIR SEPA JEAN DUPONT;900,00",
    ].join("\n");
    const table = parseDelimited(csv);
    const mapping = suggestMapping(table.headers, "bank_transactions");
    const { rows } = parseBankStatementRows("org-1", table, mapping);
    expect(rows).toHaveLength(2);
    expect(rows[0].externalId).not.toBe(rows[1].externalId);
  });

  it("scopes externalIds per organization, so two orgs' identical-looking transactions never collide", () => {
    const csv = ["Date;Libellé;Montant", "15/06/2026;VIR SEPA JEAN DUPONT;900,00"].join("\n");
    const table = parseDelimited(csv);
    const mapping = suggestMapping(table.headers, "bank_transactions");
    const a = parseBankStatementRows("org-a", table, mapping);
    const b = parseBankStatementRows("org-b", table, mapping);
    expect(a.rows[0].externalId).not.toBe(b.rows[0].externalId);
  });
});
