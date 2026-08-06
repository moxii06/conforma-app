import { describe, it, expect } from "vitest";
import {
  axeClassement,
  correspondAuxFiltres,
  decouperEnSections,
  ordonnerLots,
  optionsAnnee,
  optionsFormation,
  optionsType,
  HORS_FORMATION,
  HORS_FORMATION_LABEL,
  type LotClassable,
} from "./documentClassement";

function lot(p: Partial<LotClassable> & { key: string }): LotClassable {
  return {
    createdAt: new Date("2026-03-10T10:00:00Z"),
    courseId: "c1",
    formation: "Sécurité au travail",
    category: "contrat_formation",
    typeLabel: "Contrat de formation",
    ...p,
  };
}

describe("axeClassement", () => {
  it("accepte les axes connus", () => {
    expect(axeClassement("formation")).toBe("formation");
    expect(axeClassement("type")).toBe("type");
  });

  it("retombe sur la date pour tout le reste", () => {
    expect(axeClassement(undefined)).toBe("date");
    expect(axeClassement("n-importe-quoi")).toBe("date");
  });
});

describe("correspondAuxFiltres", () => {
  const l = lot({ key: "a", createdAt: new Date("2025-06-01T00:00:00Z") });

  it("ne filtre rien quand aucun filtre n'est posé", () => {
    expect(correspondAuxFiltres(l, {})).toBe(true);
  });

  it("cumule les trois filtres", () => {
    expect(correspondAuxFiltres(l, { formation: "c1", category: "contrat_formation", annee: "2025" })).toBe(true);
    expect(correspondAuxFiltres(l, { formation: "c1", category: "contrat_formation", annee: "2024" })).toBe(false);
    expect(correspondAuxFiltres(l, { formation: "c2" })).toBe(false);
  });

  it("sait désigner les documents rattachés à aucune formation", () => {
    const orphelin = lot({ key: "b", courseId: null, formation: null });
    expect(correspondAuxFiltres(orphelin, { formation: HORS_FORMATION })).toBe(true);
    expect(correspondAuxFiltres(l, { formation: HORS_FORMATION })).toBe(false);
  });
});

describe("ordonnerLots", () => {
  const anciens = lot({ key: "vieux", createdAt: new Date("2024-01-01T00:00:00Z") });
  const recents = lot({ key: "recent", createdAt: new Date("2026-01-01T00:00:00Z") });

  it("classe par date décroissante par défaut", () => {
    expect(ordonnerLots([anciens, recents], "date").map((l) => l.key)).toEqual(["recent", "vieux"]);
  });

  it("classe les formations par titre, accents compris", () => {
    const lots = [
      lot({ key: "z", courseId: "z", formation: "Zoologie" }),
      lot({ key: "e", courseId: "e", formation: "Électricité" }),
      lot({ key: "b", courseId: "b", formation: "Bureautique" }),
    ];
    expect(ordonnerLots(lots, "formation").map((l) => l.key)).toEqual(["b", "e", "z"]);
  });

  it("renvoie les documents hors formation en dernier", () => {
    const lots = [
      lot({ key: "orphelin", courseId: null, formation: null }),
      lot({ key: "zoologie", courseId: "z", formation: "Zoologie" }),
    ];
    expect(ordonnerLots(lots, "formation").map((l) => l.key)).toEqual(["zoologie", "orphelin"]);
  });

  it("garde le plus récent d'abord à l'intérieur d'une même formation", () => {
    const lots = [
      lot({ key: "vieux", createdAt: new Date("2024-01-01T00:00:00Z") }),
      lot({ key: "recent", createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    expect(ordonnerLots(lots, "formation").map((l) => l.key)).toEqual(["recent", "vieux"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const lots = [anciens, recents];
    ordonnerLots(lots, "date");
    expect(lots.map((l) => l.key)).toEqual(["vieux", "recent"]);
  });
});

describe("decouperEnSections", () => {
  it("groupe par mois sur l'axe date", () => {
    const lots = ordonnerLots(
      [
        lot({ key: "a", createdAt: new Date("2026-03-10T10:00:00Z") }),
        lot({ key: "b", createdAt: new Date("2026-03-02T10:00:00Z") }),
        lot({ key: "c", createdAt: new Date("2026-02-27T10:00:00Z") }),
      ],
      "date"
    );
    const sections = decouperEnSections(lots, "date");
    expect(sections.map((s) => s.key)).toEqual(["2026-03", "2026-02"]);
    expect(sections[0].label).toBe("Mars 2026");
    expect(sections[0].lots).toHaveLength(2);
  });

  it("nomme la section des documents hors formation", () => {
    const lots = ordonnerLots([lot({ key: "a", courseId: null, formation: null })], "formation");
    expect(decouperEnSections(lots, "formation")[0].label).toBe(HORS_FORMATION_LABEL);
  });

  it("ne fusionne pas deux sections de même clé séparées par une autre", () => {
    // Une liste mal ordonnée doit produire des sections répétées plutôt que
    // de rassembler à distance : le découpage suit l'ordre, il ne le corrige
    // pas.
    const lots = [
      lot({ key: "a", category: "x", typeLabel: "X" }),
      lot({ key: "b", category: "y", typeLabel: "Y" }),
      lot({ key: "c", category: "x", typeLabel: "X" }),
    ];
    expect(decouperEnSections(lots, "type").map((s) => s.key)).toEqual(["x", "y", "x"]);
  });

  it("rend une liste vide sans section", () => {
    expect(decouperEnSections([], "formation")).toEqual([]);
  });
});

describe("options de filtre", () => {
  const lots = [
    lot({ key: "a", courseId: "c1", formation: "Sécurité", category: "contrat_formation", typeLabel: "Contrat" }),
    lot({ key: "b", courseId: "c1", formation: "Sécurité", category: "convocation", typeLabel: "Convocation" }),
    lot({
      key: "c",
      courseId: null,
      formation: null,
      category: "contrat_formation",
      typeLabel: "Contrat",
      createdAt: new Date("2024-05-05T00:00:00Z"),
    }),
  ];

  it("compte les lots par formation, hors formation en dernier", () => {
    expect(optionsFormation(lots)).toEqual([
      { value: "c1", label: "Sécurité", count: 2 },
      { value: HORS_FORMATION, label: HORS_FORMATION_LABEL, count: 1 },
    ]);
  });

  it("compte les lots par type, classés par libellé", () => {
    expect(optionsType(lots)).toEqual([
      { value: "contrat_formation", label: "Contrat", count: 2 },
      { value: "convocation", label: "Convocation", count: 1 },
    ]);
  });

  it("compte les lots par année, la plus récente d'abord", () => {
    expect(optionsAnnee(lots)).toEqual([
      { value: "2026", label: "2026", count: 2 },
      { value: "2024", label: "2024", count: 1 },
    ]);
  });

  it("ne propose que ce qui existe", () => {
    expect(optionsFormation([])).toEqual([]);
    expect(optionsType([])).toEqual([]);
  });
});
