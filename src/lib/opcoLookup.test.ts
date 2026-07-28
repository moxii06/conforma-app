import { describe, expect, it } from "vitest";
import { normalizeSiret } from "./opcoLookup";

describe("normalizeSiret", () => {
  it("accepts a plain 14-digit SIRET and strips formatting", () => {
    expect(normalizeSiret("13002526500013")).toBe("13002526500013");
    expect(normalizeSiret("130 025 265 00013")).toBe("13002526500013");
    expect(normalizeSiret("130.025.265.00013")).toBe("13002526500013");
  });

  it("rejects SIREN (9 digits), garbage and empty input", () => {
    expect(normalizeSiret("130025265")).toBeNull();
    expect(normalizeSiret("pas un siret")).toBeNull();
    expect(normalizeSiret("")).toBeNull();
  });
});
