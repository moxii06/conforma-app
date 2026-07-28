import { describe, expect, it } from "vitest";
import { computeFundingSummary, resolveDossierPriceCents } from "./funding";

// Money split across several funders is exactly the kind of arithmetic that
// looks obvious and silently goes wrong — a "requested" amount counted as
// covered, a refused one still in the total, a negative reste à charge shown
// to a client. Each case below is one of those.

const NOW = new Date("2026-07-28T00:00:00Z");

describe("resolveDossierPriceCents", () => {
  it("prefers the price negotiated on the dossier", () => {
    expect(resolveDossierPriceCents({ agreedPriceCents: 90000 }, { priceCents: 120000 })).toBe(90000);
  });

  it("falls back to the course catalogue price when nothing was negotiated", () => {
    expect(resolveDossierPriceCents({ agreedPriceCents: null }, { priceCents: 120000 })).toBe(120000);
  });

  it("treats a course with no price as zero rather than throwing", () => {
    expect(resolveDossierPriceCents({ agreedPriceCents: null }, { priceCents: null })).toBe(0);
  });
});

describe("computeFundingSummary", () => {
  it("counts only agreed funding as secured, and leaves the rest to the client", () => {
    const s = computeFundingSummary(
      150000,
      [
        { amountCents: 100000, status: "granted", subrogation: true },
        { amountCents: 30000, status: "requested", subrogation: false },
      ],
      { now: NOW },
    );
    expect(s.securedCents).toBe(100000);
    expect(s.pendingCents).toBe(30000);
    // 30 000 is still only *asked for*, so it must NOT reduce what the client owes.
    expect(s.remainderCents).toBe(50000);
  });

  it("ignores refused commitments entirely", () => {
    const s = computeFundingSummary(
      100000,
      [
        { amountCents: 60000, status: "refused", subrogation: true },
        { amountCents: 20000, status: "granted", subrogation: true },
      ],
      { now: NOW },
    );
    expect(s.securedCents).toBe(20000);
    expect(s.pendingCents).toBe(0);
    expect(s.remainderCents).toBe(80000);
  });

  it("treats invoiced and paid as secured, like granted", () => {
    const s = computeFundingSummary(
      100000,
      [
        { amountCents: 40000, status: "invoiced", subrogation: true },
        { amountCents: 60000, status: "paid", subrogation: true },
      ],
      { now: NOW },
    );
    expect(s.securedCents).toBe(100000);
    expect(s.remainderCents).toBe(0);
  });

  it("separates the subrogated share — that's what gets invoiced to funders", () => {
    const s = computeFundingSummary(
      100000,
      [
        { amountCents: 70000, status: "granted", subrogation: true },
        // Employer pays and claims it back themselves: still secured, but it
        // belongs on the client's invoice, not on a funder's.
        { amountCents: 20000, status: "granted", subrogation: false },
      ],
      { now: NOW },
    );
    expect(s.securedCents).toBe(90000);
    expect(s.subrogatedCents).toBe(70000);
    expect(s.remainderCents).toBe(10000);
  });

  it("never reports a negative reste à charge, and flags the over-commitment", () => {
    const s = computeFundingSummary(100000, [{ amountCents: 120000, status: "granted", subrogation: true }], { now: NOW });
    expect(s.remainderCents).toBe(0);
    expect(s.overCommitted).toBe(true);
  });

  it("flags agreements expiring within the warning window", () => {
    const s = computeFundingSummary(
      100000,
      [
        { amountCents: 50000, status: "granted", subrogation: true, validUntil: new Date("2026-08-10T00:00:00Z") },
        { amountCents: 50000, status: "granted", subrogation: true, validUntil: new Date("2027-01-01T00:00:00Z") },
      ],
      { now: NOW, expiryWarningDays: 30 },
    );
    expect(s.expiringSoon).toHaveLength(1);
    expect(s.expiringSoon[0].amountCents).toBe(50000);
  });

  it("does not warn about an expiring agreement that has already paid out", () => {
    const s = computeFundingSummary(
      100000,
      [{ amountCents: 50000, status: "paid", subrogation: true, validUntil: new Date("2026-08-01T00:00:00Z") }],
      { now: NOW, expiryWarningDays: 30 },
    );
    expect(s.expiringSoon).toHaveLength(0);
  });

  it("puts the whole price on the client when nothing is funded", () => {
    const s = computeFundingSummary(80000, [], { now: NOW });
    expect(s.remainderCents).toBe(80000);
    expect(s.overCommitted).toBe(false);
  });
});
