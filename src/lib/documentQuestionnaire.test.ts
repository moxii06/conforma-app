import { describe, expect, it } from "vitest";
import { SessionFormat } from "@prisma/client";
import { resolveAnswers } from "./documentQuestionnaire";

const baseCtx = {
  dossier: { learnerCategory: null as string | null, agreedPriceCents: null as number | null },
  session: { format: SessionFormat.IN_PERSON },
  course: { priceCents: 100000 },
  fundingCommitments: [] as { amountCents: number; status: string; subrogation: boolean; validUntil?: Date | null }[],
};

describe("resolveAnswers — statutApprenant", () => {
  it("resolves individual/jobseeker to 'individual'", () => {
    expect(resolveAnswers({ ...baseCtx, dossier: { ...baseCtx.dossier, learnerCategory: "individual" } }).answers.statutApprenant).toBe("individual");
    expect(resolveAnswers({ ...baseCtx, dossier: { ...baseCtx.dossier, learnerCategory: "jobseeker" } }).answers.statutApprenant).toBe("individual");
  });

  it("resolves employee/apprentice to 'company'", () => {
    expect(resolveAnswers({ ...baseCtx, dossier: { ...baseCtx.dossier, learnerCategory: "employee" } }).answers.statutApprenant).toBe("company");
    expect(resolveAnswers({ ...baseCtx, dossier: { ...baseCtx.dossier, learnerCategory: "apprentice" } }).answers.statutApprenant).toBe("company");
  });

  it("stays unresolved when the dossier has no learnerCategory yet", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("statutApprenant");
  });
});

describe("resolveAnswers — modalite", () => {
  it("always resolves directly from the session format", () => {
    expect(resolveAnswers({ ...baseCtx, session: { format: SessionFormat.REMOTE } }).answers.modalite).toBe("REMOTE");
    expect(resolveAnswers({ ...baseCtx, session: { format: SessionFormat.HYBRID } }).answers.modalite).toBe("HYBRID");
  });
});

describe("resolveAnswers — subrogation", () => {
  it("is 'non' when there are no funding commitments", () => {
    expect(resolveAnswers(baseCtx).answers.subrogation).toBe("non");
  });

  it("is 'oui' as soon as an active commitment declares subrogation, even before it's granted", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 50000, status: "deposited", subrogation: true }] };
    expect(resolveAnswers(ctx).answers.subrogation).toBe("oui");
  });

  it("ignores refused commitments", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 50000, status: "refused", subrogation: true }] };
    expect(resolveAnswers(ctx).answers.subrogation).toBe("non");
  });

  it("is 'non' when every active commitment is non-subrogated", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 50000, status: "granted", subrogation: false }] };
    expect(resolveAnswers(ctx).answers.subrogation).toBe("non");
  });
});

describe("resolveAnswers — resteACharge", () => {
  it("is 'oui' when nothing is funded", () => {
    expect(resolveAnswers(baseCtx).answers.resteACharge).toBe("oui");
  });

  it("is 'non' once a granted commitment covers the whole price", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 100000, status: "granted", subrogation: true }] };
    expect(resolveAnswers(ctx).answers.resteACharge).toBe("non");
  });

  it("uses the dossier's negotiated price over the course price when set", () => {
    const ctx = {
      ...baseCtx,
      dossier: { ...baseCtx.dossier, agreedPriceCents: 50000 },
      fundingCommitments: [{ amountCents: 50000, status: "granted", subrogation: true }],
    };
    expect(resolveAnswers(ctx).answers.resteACharge).toBe("non");
  });
});

describe("resolveAnswers — manual overrides", () => {
  it("prefers a manual answer over the auto-resolver", () => {
    const ctx = { ...baseCtx, dossier: { ...baseCtx.dossier, learnerCategory: "individual" } };
    expect(resolveAnswers(ctx, { statutApprenant: "company" }).answers.statutApprenant).toBe("company");
  });

  it("ignores a manual answer that names an unknown option", () => {
    const { unresolved } = resolveAnswers(baseCtx, { statutApprenant: "not_a_real_option" });
    expect(unresolved).toContain("statutApprenant");
  });

  it("fills in exactly the unresolved questions, leaving auto-resolved ones untouched", () => {
    const ctx = { ...baseCtx, session: { format: SessionFormat.REMOTE } };
    const { answers, unresolved } = resolveAnswers(ctx, { statutApprenant: "individual" });
    expect(answers).toEqual({ statutApprenant: "individual", modalite: "REMOTE", subrogation: "non", resteACharge: "oui" });
    expect(unresolved).toEqual([]);
  });
});
