import { describe, expect, it } from "vitest";
import {
  computeFundingSummary,
  resolveDossierPriceCents,
  computeFundingReadiness,
  isAwaitingFunderTooLong,
  isAgreementExpiringSoon,
  estimateFundingAmountCents,
} from "./funding";

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
        { amountCents: 30000, status: "deposited", subrogation: false },
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

describe("computeFundingReadiness", () => {
  const ready: import("./funding").ReadinessInput = {
    dossier: { needsAssessmentDone: true, contractSigned: true },
    course: {
      objectives: "Savoir X",
      prerequisites: "",
      durationHours: 7,
      teachingMethods: "E-learning",
      evaluationModalities: "Quiz",
    },
    session: { mode: "FIXED_DATE", startsAt: new Date("2026-09-01"), endsAt: new Date("2026-09-02") },
    organization: { qualiopiCertificateNumber: "QUAL-123", qualiopiCertificateUntil: new Date("2028-01-01") },
    documentCategories: ["convention"],
    trainerHasDocuments: true,
    quoteExists: true,
  };
  const NOW2 = new Date("2026-07-28T00:00:00Z");

  it("passes every item on a complete dossier", () => {
    const items = computeFundingReadiness(ready, NOW2);
    expect(items.every((i) => i.ok)).toBe(true);
  });

  it("accepts empty-string prerequisites (a real 'sans prérequis') but not null (never filled)", () => {
    const items = computeFundingReadiness(
      { ...ready, course: { ...ready.course, prerequisites: null } },
      NOW2,
    );
    expect(items.find((i) => i.key === "programme")?.ok).toBe(false);
  });

  it("rejects an expired Qualiopi certificate — the most common deposit refusal", () => {
    const items = computeFundingReadiness(
      { ...ready, organization: { qualiopiCertificateNumber: "QUAL-123", qualiopiCertificateUntil: new Date("2026-01-01") } },
      NOW2,
    );
    expect(items.find((i) => i.key === "certificat_qualiopi")?.ok).toBe(false);
  });

  it("counts the convention via the manual flag OR an uploaded document", () => {
    const viaFlag = computeFundingReadiness(
      { ...ready, documentCategories: [], dossier: { ...ready.dossier, contractSigned: true } },
      NOW2,
    );
    const viaDoc = computeFundingReadiness(
      { ...ready, dossier: { ...ready.dossier, contractSigned: false }, documentCategories: ["convention"] },
      NOW2,
    );
    expect(viaFlag.find((i) => i.key === "convention")?.ok).toBe(true);
    expect(viaDoc.find((i) => i.key === "convention")?.ok).toBe(true);
  });

  it("treats a rolling course as having a calendar by construction", () => {
    const items = computeFundingReadiness(
      { ...ready, session: { mode: "ROLLING", startsAt: new Date("2026-09-01"), endsAt: new Date("2026-09-01") } },
      NOW2,
    );
    expect(items.find((i) => i.key === "calendrier")?.ok).toBe(true);
  });
});

describe("estimateFundingAmountCents", () => {
  it("multiplies the hourly rate by the course duration", () => {
    expect(estimateFundingAmountCents({ hourlyRateCents: 1500, maxAmountCents: null }, 21)).toBe(31500);
  });

  it("caps the estimate at the per-dossier ceiling", () => {
    expect(estimateFundingAmountCents({ hourlyRateCents: 1500, maxAmountCents: 20000 }, 21)).toBe(20000);
  });

  it("falls back to the ceiling alone — a forfait — when no rate is set", () => {
    expect(estimateFundingAmountCents({ hourlyRateCents: null, maxAmountCents: 300000 }, 21)).toBe(300000);
    expect(estimateFundingAmountCents({ hourlyRateCents: 1500, maxAmountCents: 300000 }, null)).toBe(300000);
  });

  it("says nothing when the barème can't — never a made-up number", () => {
    expect(estimateFundingAmountCents({ hourlyRateCents: null, maxAmountCents: null }, 21)).toBeNull();
    expect(estimateFundingAmountCents({ hourlyRateCents: 1500, maxAmountCents: null }, null)).toBeNull();
    expect(estimateFundingAmountCents({ hourlyRateCents: 1500, maxAmountCents: null }, 0)).toBeNull();
  });
});

describe("isAwaitingFunderTooLong", () => {
  it("fires on a deposited dossier silent past the threshold", () => {
    expect(isAwaitingFunderTooLong({ status: "deposited", depositedAt: new Date("2026-06-01") }, NOW, 30)).toBe(true);
    expect(isAwaitingFunderTooLong({ status: "instructing", depositedAt: new Date("2026-06-01") }, NOW, 30)).toBe(true);
  });

  it("stays quiet while the silence is still within the threshold", () => {
    expect(isAwaitingFunderTooLong({ status: "deposited", depositedAt: new Date("2026-07-15") }, NOW, 30)).toBe(false);
  });

  it("never fires once the funder has answered, whatever the answer", () => {
    const old = new Date("2026-01-01");
    expect(isAwaitingFunderTooLong({ status: "granted", depositedAt: old }, NOW, 30)).toBe(false);
    expect(isAwaitingFunderTooLong({ status: "refused", depositedAt: old }, NOW, 30)).toBe(false);
  });

  it("ignores commitments with no deposit timestamp — there is no silence to measure", () => {
    expect(isAwaitingFunderTooLong({ status: "deposited", depositedAt: null }, NOW, 30)).toBe(false);
  });
});

describe("isAgreementExpiringSoon", () => {
  it("warns on granted and invoiced agreements inside the window", () => {
    const soon = new Date("2026-08-10");
    expect(isAgreementExpiringSoon({ status: "granted", validUntil: soon }, NOW, 30)).toBe(true);
    expect(isAgreementExpiringSoon({ status: "invoiced", validUntil: soon }, NOW, 30)).toBe(true);
  });

  it("keeps warning after the date has passed — the money is now at risk, not safe", () => {
    expect(isAgreementExpiringSoon({ status: "granted", validUntil: new Date("2026-07-01") }, NOW, 30)).toBe(true);
  });

  it("never warns once paid, and never on unsecured statuses", () => {
    const soon = new Date("2026-08-10");
    expect(isAgreementExpiringSoon({ status: "paid", validUntil: soon }, NOW, 30)).toBe(false);
    expect(isAgreementExpiringSoon({ status: "deposited", validUntil: soon }, NOW, 30)).toBe(false);
  });

  it("ignores agreements with no expiry date", () => {
    expect(isAgreementExpiringSoon({ status: "granted", validUntil: null }, NOW, 30)).toBe(false);
  });
});

describe("computeFundingSummary — nouveaux statuts", () => {
  it("counts draft, deposited and instructing as pending, never as secured", () => {
    const s = computeFundingSummary(
      100000,
      [
        { amountCents: 20000, status: "draft", subrogation: true },
        { amountCents: 30000, status: "deposited", subrogation: true },
        { amountCents: 40000, status: "instructing", subrogation: true },
      ],
      { now: new Date("2026-07-28") },
    );
    expect(s.securedCents).toBe(0);
    expect(s.pendingCents).toBe(90000);
    expect(s.remainderCents).toBe(100000);
  });
});
