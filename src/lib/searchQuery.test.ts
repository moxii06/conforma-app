import { describe, expect, it } from "vitest";
import { parseDateQuery } from "./searchQuery";

const MAINTENANT = new Date(2026, 6, 31); // 31 juillet 2026

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("parseDateQuery", () => {
  it("lit une date au format jj/mm et complète avec l'année en cours", () => {
    const r = parseDateQuery("12/03", MAINTENANT)!;
    expect(iso(r.from)).toBe("2026-03-12");
    expect(iso(r.to)).toBe("2026-03-12");
    expect(r.to.getHours()).toBe(23);
  });

  it("accepte les séparateurs . et - et une année sur deux chiffres", () => {
    expect(iso(parseDateQuery("5-9-25", MAINTENANT)!.from)).toBe("2025-09-05");
    expect(iso(parseDateQuery("01.12.2027", MAINTENANT)!.from)).toBe("2027-12-01");
  });

  it("lit « 12 mars » et « 12 mars 2027 »", () => {
    expect(iso(parseDateQuery("12 mars", MAINTENANT)!.from)).toBe("2026-03-12");
    expect(iso(parseDateQuery("3 février 2027", MAINTENANT)!.from)).toBe("2027-02-03");
  });

  it("renvoie le mois entier quand seul le mois est donné", () => {
    const r = parseDateQuery("mars", MAINTENANT)!;
    expect(iso(r.from)).toBe("2026-03-01");
    expect(iso(r.to)).toBe("2026-03-31");
  });

  it("gère la fin de mois variable", () => {
    expect(iso(parseDateQuery("février 2026", MAINTENANT)!.to)).toBe("2026-02-28");
    expect(iso(parseDateQuery("février 2028", MAINTENANT)!.to)).toBe("2028-02-29");
  });

  it("refuse une date qui n'existe pas plutôt que de déborder sur le mois suivant", () => {
    // new Date(2026, 1, 31) donne le 3 mars sans broncher. Répondre « voici
    // le 3 mars » à qui a tapé « 31/02 » est pire que ne rien répondre.
    expect(parseDateQuery("31/02", MAINTENANT)).toBeNull();
    expect(parseDateQuery("32/01", MAINTENANT)).toBeNull();
    expect(parseDateQuery("12/13", MAINTENANT)).toBeNull();
  });

  it("laisse passer le texte ordinaire à la recherche textuelle", () => {
    expect(parseDateQuery("bureautique", MAINTENANT)).toBeNull();
    expect(parseDateQuery("FAC-2026-001", MAINTENANT)).toBeNull();
    expect(parseDateQuery("karim", MAINTENANT)).toBeNull();
    expect(parseDateQuery("", MAINTENANT)).toBeNull();
  });
});
