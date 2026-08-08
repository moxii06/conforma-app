import { describe, expect, it } from "vitest";
import { SessionFormat } from "@prisma/client";
import { proposerReportsFormation, resolveAnswers } from "./documentQuestionnaire";

const baseCtx = {
  dossier: { learnerCategory: null as string | null, agreedPriceCents: null as number | null },
  session: {
    format: SessionFormat.IN_PERSON as SessionFormat | null,
    withdrawalAccessPolicy: null as string | null,
    contractSigningMode: null as string | null,
    ateliersCount: 0,
  },
  course: {
    priceCents: 100000 as number | null,
    certificationCode: null as string | null,
    withdrawalAccessPolicy: null as string | null,
  },
  contact: { birthDate: null as Date | null },
  fundingCommitments: [] as { amountCents: number; status: string; subrogation: boolean; validUntil?: Date | null }[],
  organization: { withdrawalAccessPolicy: "closed", cancellationFeePercent: null as number | null },
};

/** Une date de naissance donnant l'âge voulu aujourd'hui, à un jour près —
 *  écrite en relatif parce qu'une date fixe ferait vieillir le test. */
function neIlYA(ans: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ans);
  d.setDate(d.getDate() - 1);
  return d;
}

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

describe("resolveAnswers — certificationVisee", () => {
  it("is 'non' when the course has no certification code", () => {
    expect(resolveAnswers(baseCtx).answers.certificationVisee).toBe("non");
  });

  it("is 'oui' as soon as the course names a certification code", () => {
    const ctx = { ...baseCtx, course: { ...baseCtx.course, certificationCode: "RS5839" } };
    expect(resolveAnswers(ctx).answers.certificationVisee).toBe("oui");
  });
});

describe("resolveAnswers — paiement", () => {
  it("stays unresolved when the beneficiary still owes something — the schedule is captured after the document", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("paiement");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { paiement: "echelonne" }).answers.paiement).toBe("echelonne");
  });

  it("is 'opco_direct' once a subrogated commitment covers the whole price", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 100000, status: "granted", subrogation: true }] };
    expect(resolveAnswers(ctx).answers.paiement).toBe("opco_direct");
  });

  it("stays unresolved when the funder covers everything WITHOUT subrogation — the client still pays", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 100000, status: "granted", subrogation: false }] };
    expect(resolveAnswers(ctx).unresolved).toContain("paiement");
  });

  it("stays unresolved on a partial subrogation — a remainder is still due", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 40000, status: "granted", subrogation: true }] };
    expect(resolveAnswers(ctx).unresolved).toContain("paiement");
  });

  it("stays unresolved on a free course — a zero price says nothing about how it is paid", () => {
    const ctx = { ...baseCtx, course: { ...baseCtx.course, priceCents: 0 } };
    expect(resolveAnswers(ctx).unresolved).toContain("paiement");
  });

  it("lets a manual answer override the auto-resolved OPCO branch", () => {
    const ctx = { ...baseCtx, fundingCommitments: [{ amountCents: 100000, status: "granted", subrogation: true }] };
    expect(resolveAnswers(ctx, { paiement: "echelonne" }).answers.paiement).toBe("echelonne");
  });
});

describe("resolveAnswers — accesImmediat", () => {
  it("is 'non' when the organisation keeps access closed during withdrawal", () => {
    expect(resolveAnswers(baseCtx).answers.accesImmediat).toBe("non");
  });

  it("is 'oui' when the organisation allows partial early access", () => {
    const ctx = { ...baseCtx, organization: { ...baseCtx.organization, withdrawalAccessPolicy: "partial" } };
    expect(resolveAnswers(ctx).answers.accesImmediat).toBe("oui");
  });

  it("lets the course override the organisation", () => {
    const ctx = { ...baseCtx, course: { ...baseCtx.course, withdrawalAccessPolicy: "partial" } };
    expect(resolveAnswers(ctx).answers.accesImmediat).toBe("oui");
  });

  it("lets the session override the course", () => {
    const ctx = {
      ...baseCtx,
      course: { ...baseCtx.course, withdrawalAccessPolicy: "partial" },
      session: { ...baseCtx.session, withdrawalAccessPolicy: "closed" },
    };
    expect(resolveAnswers(ctx).answers.accesImmediat).toBe("non");
  });
});

describe("resolveAnswers — ateliers", () => {
  it("is 'oui' as soon as an atelier is scheduled on the session", () => {
    const ctx = { ...baseCtx, session: { ...baseCtx.session, ateliersCount: 2 } };
    expect(resolveAnswers(ctx).answers.ateliers).toBe("oui");
  });

  it("stays unresolved with no atelier scheduled — none today doesn't mean none ever", () => {
    expect(resolveAnswers(baseCtx).unresolved).toContain("ateliers");
  });

  it("stays unresolved when the caller can't count ateliers at all (CRM, sous-traitant)", () => {
    const ctx = { ...baseCtx, session: { format: SessionFormat.IN_PERSON as SessionFormat | null } };
    expect(resolveAnswers(ctx).unresolved).toContain("ateliers");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { ateliers: "non" }).answers.ateliers).toBe("non");
  });
});

describe("resolveAnswers — autorisationImage", () => {
  it("is 'mineur' when the contact's birth date makes them under 18", () => {
    const ctx = { ...baseCtx, contact: { birthDate: neIlYA(16) } };
    expect(resolveAnswers(ctx).answers.autorisationImage).toBe("mineur");
  });

  it("stays unresolved for an adult — granting or refusing is a personal decision, not a record", () => {
    const ctx = { ...baseCtx, contact: { birthDate: neIlYA(30) } };
    expect(resolveAnswers(ctx).unresolved).toContain("autorisationImage");
  });

  it("stays unresolved when no birth date is on file", () => {
    expect(resolveAnswers(baseCtx).unresolved).toContain("autorisationImage");
  });

  it("accepts a manual answer, including over the minor branch", () => {
    const ctx = { ...baseCtx, contact: { birthDate: neIlYA(16) } };
    expect(resolveAnswers(ctx, { autorisationImage: "refusee" }).answers.autorisationImage).toBe("refusee");
  });
});

describe("resolveAnswers — retractation", () => {
  it("is 'sans_delai' when the contract was signed in person", () => {
    const ctx = { ...baseCtx, session: { ...baseCtx.session, contractSigningMode: "in_person" } };
    expect(resolveAnswers(ctx).answers.retractation).toBe("sans_delai");
  });

  it("is 'avec_blocage' for a remote contract on a closed-access policy", () => {
    const ctx = { ...baseCtx, session: { ...baseCtx.session, contractSigningMode: "remote" } };
    expect(resolveAnswers(ctx).answers.retractation).toBe("avec_blocage");
  });

  it("is 'sans_blocage' for a remote contract once the course opens access during the delay", () => {
    const ctx = {
      ...baseCtx,
      session: { ...baseCtx.session, contractSigningMode: "remote" },
      course: { ...baseCtx.course, withdrawalAccessPolicy: "partial" },
    };
    expect(resolveAnswers(ctx).answers.retractation).toBe("sans_blocage");
  });

  it("stays unresolved while the signing mode is unknown — the access policy answers another question", () => {
    const ctx = { ...baseCtx, course: { ...baseCtx.course, withdrawalAccessPolicy: "partial" } };
    expect(resolveAnswers(ctx).unresolved).toContain("retractation");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { retractation: "sans_delai" }).answers.retractation).toBe("sans_delai");
  });
});

describe("resolveAnswers — droitImage", () => {
  it("always stays unresolved — no per-beneficiary record exists", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("droitImage");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { droitImage: "oui" }).answers.droitImage).toBe("oui");
  });
});

describe("resolveAnswers — indemniteAnnulation", () => {
  it("is 'non' when the organisation has set no cancellation fee", () => {
    expect(resolveAnswers(baseCtx).answers.indemniteAnnulation).toBe("non");
  });

  it("is 'oui' as soon as the organisation has a cancellation fee percentage set", () => {
    const ctx = { ...baseCtx, organization: { ...baseCtx.organization, cancellationFeePercent: 20 } };
    expect(resolveAnswers(ctx).answers.indemniteAnnulation).toBe("oui");
  });
});

describe("resolveAnswers — missionFormateur", () => {
  it("always stays unresolved — no dossier field backs it", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("missionFormateur");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { missionFormateur: "collectif" }).answers.missionFormateur).toBe("collectif");
  });
});

describe("resolveAnswers — enregistrementSessions", () => {
  it("always stays unresolved", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("enregistrementSessions");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { enregistrementSessions: "oui" }).answers.enregistrementSessions).toBe("oui");
  });
});

describe("resolveAnswers — stagiairesApparaissent", () => {
  it("always stays unresolved", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("stagiairesApparaissent");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { stagiairesApparaissent: "oui" }).answers.stagiairesApparaissent).toBe("oui");
  });
});

describe("resolveAnswers — contenuRevente", () => {
  it("always stays unresolved", () => {
    const { unresolved } = resolveAnswers(baseCtx);
    expect(unresolved).toContain("contenuRevente");
  });

  it("accepts a manual answer", () => {
    expect(resolveAnswers(baseCtx, { contenuRevente: "non" }).answers.contenuRevente).toBe("non");
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
    const ctx = { ...baseCtx, session: { ...baseCtx.session, format: SessionFormat.REMOTE } };
    const { answers, unresolved } = resolveAnswers(ctx, {
      statutApprenant: "individual",
      paiement: "comptant",
      droitImage: "non",
      missionFormateur: "individualise",
      enregistrementSessions: "non",
      stagiairesApparaissent: "non",
      contenuRevente: "non",
      ateliers: "non",
      autorisationImage: "accordee",
      retractation: "avec_blocage",
    });
    expect(answers).toEqual({
      statutApprenant: "individual",
      modalite: "REMOTE",
      subrogation: "non",
      resteACharge: "oui",
      certificationVisee: "non",
      paiement: "comptant",
      accesImmediat: "non",
      droitImage: "non",
      indemniteAnnulation: "non",
      missionFormateur: "individualise",
      enregistrementSessions: "non",
      stagiairesApparaissent: "non",
      contenuRevente: "non",
      ateliers: "non",
      autorisationImage: "accordee",
      retractation: "avec_blocage",
    });
    expect(unresolved).toEqual([]);
  });
});

describe("proposerReportsFormation", () => {
  it("proposes nothing when nothing was typed by hand", () => {
    expect(proposerReportsFormation({}, { withdrawalAccessPolicy: null })).toEqual([]);
  });

  it("proposes the withdrawal-access policy from a hand-typed retractation answer", () => {
    const reports = proposerReportsFormation({ retractation: "avec_blocage" }, { withdrawalAccessPolicy: null });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ questionKey: "retractation", champ: "withdrawalAccessPolicy", valeur: "closed" });
  });

  it("maps 'sans_blocage' to a course that opens access during the delay", () => {
    const reports = proposerReportsFormation({ retractation: "sans_blocage" }, { withdrawalAccessPolicy: null });
    expect(reports[0].valeur).toBe("partial");
  });

  it("proposes nothing for 'sans_delai' — no course field carries how a contract was signed", () => {
    expect(proposerReportsFormation({ retractation: "sans_delai" }, { withdrawalAccessPolicy: null })).toEqual([]);
  });

  it("never proposes overwriting a course setting that already exists", () => {
    expect(proposerReportsFormation({ retractation: "avec_blocage" }, { withdrawalAccessPolicy: "partial" })).toEqual([]);
  });

  it("proposes one write per field, even when two answers target the same one", () => {
    const reports = proposerReportsFormation(
      { accesImmediat: "oui", retractation: "avec_blocage" },
      { withdrawalAccessPolicy: null },
    );
    expect(reports).toHaveLength(1);
  });

  it("ignores an answer that names no real option", () => {
    expect(proposerReportsFormation({ retractation: "peut_etre" }, { withdrawalAccessPolicy: null })).toEqual([]);
  });

  it("ignores a question that has no course field behind it", () => {
    expect(proposerReportsFormation({ droitImage: "oui" }, { withdrawalAccessPolicy: null })).toEqual([]);
  });
});
