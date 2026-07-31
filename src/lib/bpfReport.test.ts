import { describe, expect, it } from "vitest";
import { resolveSessionHours } from "./bpfReport";

// The BPF is a legally binding annual declaration. This function used to
// return wall-clock elapsed time, which over-declared multi-day sessions by
// a factor of ~3 — hence a test for something that looks trivial.

describe("resolveSessionHours", () => {
  it("sums the half-days actually held", () => {
    const session = {
      days: [
        { morningHours: 3.5, afternoonHours: 3.5 },
        { morningHours: 3.5, afternoonHours: 3.5 },
        { morningHours: 3.5, afternoonHours: 3.5 },
      ],
    };
    expect(resolveSessionHours(session, { durationHours: null })).toEqual({ hours: 21, source: "days" });
  });

  it("ignores half-days that aren't held", () => {
    const session = { days: [{ morningHours: 3, afternoonHours: null }] };
    expect(resolveSessionHours(session, { durationHours: null })).toEqual({ hours: 3, source: "days" });
  });

  it("never returns wall-clock time — a 3-day session is 21 h, not 56", () => {
    // The regression this file exists for: Monday 9h → Wednesday 17h is 56
    // calendar hours but 21 teaching hours.
    const session = {
      days: [
        { morningHours: 3.5, afternoonHours: 3.5 },
        { morningHours: 3.5, afternoonHours: 3.5 },
        { morningHours: 3.5, afternoonHours: 3.5 },
      ],
    };
    const { hours } = resolveSessionHours(session, { durationHours: null });
    expect(hours).toBe(21);
    expect(hours).not.toBe(56);
  });

  it("falls back to the course's declared duration when no days are set", () => {
    expect(resolveSessionHours({ days: [] }, { durationHours: 14 })).toEqual({ hours: 14, source: "course" });
  });

  it("prefers the real days over the course's nominal duration", () => {
    // A session that ran shorter than the catalogue says must be declared
    // as it ran, not as it was advertised.
    const session = { days: [{ morningHours: 3, afternoonHours: null }] };
    expect(resolveSessionHours(session, { durationHours: 14 })).toEqual({ hours: 3, source: "days" });
  });

  it("treats days with every half-day blank as not filled in", () => {
    const session = { days: [{ morningHours: null, afternoonHours: null }] };
    expect(resolveSessionHours(session, { durationHours: 7 })).toEqual({ hours: 7, source: "course" });
  });

  it("reports unknown rather than guessing when nothing is available", () => {
    expect(resolveSessionHours({ days: [] }, { durationHours: null })).toEqual({ hours: 0, source: "unknown" });
  });

  it("ignores a zero or negative course duration", () => {
    expect(resolveSessionHours({ days: [] }, { durationHours: 0 })).toEqual({ hours: 0, source: "unknown" });
  });
});
