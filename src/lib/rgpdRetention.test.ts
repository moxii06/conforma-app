import { describe, expect, it } from "vitest";
import {
  analyserDureeConservation,
  dateObtention,
  echeanceConservation,
  statutConservation,
  traitementConcerneApprenants,
} from "./rgpdRetention";
import { STARTER_REGISTER } from "./rgpdStarterRegister";

// Ce fichier décide de ce qu'un organisme croit devoir supprimer, et quand.
// Une durée mal lue fait purger des preuves d'exécution qu'un financeur
// réclamera trois ans plus tard, ou garder indéfiniment des données de
// santé. D'où des cas pris sur le registre type réellement livré.

describe("analyserDureeConservation", () => {
  it("lit la forme courante « N ans »", () => {
    expect(analyserDureeConservation("5 ans après la fin de la formation")).toEqual({ nombre: 5, unite: "an" });
    expect(analyserDureeConservation("3 ans à compter du dernier contact")).toEqual({ nombre: 3, unite: "an" });
  });

  it("ignore les nombres qui ne sont pas des durées", () => {
    // « L. 123-22 » est une référence d'article, pas dix-huit ans de
    // conservation : sans unité derrière, un nombre ne compte pas.
    expect(analyserDureeConservation("10 ans (article L. 123-22 du code de commerce)")).toEqual({
      nombre: 10,
      unite: "an",
    });
  });

  it("accepte les mois, les jours, les semaines et les nombres écrits en toutes lettres", () => {
    expect(analyserDureeConservation("6 mois")).toEqual({ nombre: 6, unite: "mois" });
    expect(analyserDureeConservation("30 jours")).toEqual({ nombre: 30, unite: "jour" });
    expect(analyserDureeConservation("2 semaines")).toEqual({ nombre: 2, unite: "semaine" });
    expect(analyserDureeConservation("un an")).toEqual({ nombre: 1, unite: "an" });
    expect(analyserDureeConservation("Trois années")).toEqual({ nombre: 3, unite: "an" });
  });

  it("rend null quand la phrase désigne un événement et non un délai", () => {
    expect(analyserDureeConservation("Durée de la formation, puis suppression")).toBeNull();
    expect(analyserDureeConservation("")).toBeNull();
    expect(analyserDureeConservation(null)).toBeNull();
  });

  it("rend null quand deux durées différentes cohabitent", () => {
    // « 5 ans, porté à 10 ans en cas de financement public » : laquelle
    // s'applique dépend d'un fait que l'écran ne connaît pas. Choisir, ce
    // serait décider à la place de l'organisme.
    expect(analyserDureeConservation("5 ans, porté à 10 ans en cas de financement public")).toBeNull();
  });

  it("ne voit pas d'ambiguïté quand les deux mentions disent la même durée", () => {
    expect(analyserDureeConservation("6 mois, prolongeable de 6 mois")).toEqual({ nombre: 6, unite: "mois" });
  });

  it("retient la durée chiffrée quand le reste de la phrase désigne un événement", () => {
    expect(analyserDureeConservation("Durée de la relation, puis 5 ans")).toEqual({ nombre: 5, unite: "an" });
    expect(analyserDureeConservation("Durée de la formation, puis 5 ans pour les preuves de réussite")).toEqual({
      nombre: 5,
      unite: "an",
    });
  });
});

describe("echeanceConservation", () => {
  // Dates construites en heure locale : l'arithmétique de date-fns l'est
  // aussi, et un littéral ISO en Z ferait dépendre le test du fuseau de la
  // machine qui l'exécute.
  it("compte en calendrier réel, pas en tranches de 365 jours", () => {
    // 29 février + 5 ans doit tomber sur une date qui existe, pas déborder
    // sur le 1er mars.
    expect(echeanceConservation(new Date(2024, 1, 29), "5 ans")).toEqual(new Date(2029, 1, 28));
    expect(echeanceConservation(new Date(2024, 0, 31), "1 mois")).toEqual(new Date(2024, 1, 29));
  });

  it("rend null quand la durée n'est pas lisible — jamais une date inventée", () => {
    expect(echeanceConservation(new Date(2024, 0, 1), "Durée de la formation, puis suppression")).toBeNull();
  });
});

describe("statutConservation", () => {
  const maintenant = new Date("2026-08-07T12:00:00Z");

  it("marque échu ce qui est passé, y compris aujourd'hui même", () => {
    expect(statutConservation(new Date("2025-01-01T00:00:00Z"), maintenant)).toBe("echu");
    expect(statutConservation(maintenant, maintenant)).toBe("echu");
  });

  it("alerte à moins de trois mois", () => {
    expect(statutConservation(new Date("2026-09-15T00:00:00Z"), maintenant)).toBe("proche");
    expect(statutConservation(new Date("2026-11-06T00:00:00Z"), maintenant)).toBe("proche");
  });

  it("laisse tranquille au-delà de trois mois", () => {
    expect(statutConservation(new Date("2026-12-01T00:00:00Z"), maintenant)).toBe("actif");
    expect(statutConservation(new Date("2031-01-01T00:00:00Z"), maintenant)).toBe("actif");
  });
});

describe("traitementConcerneApprenants", () => {
  it("reconnaît le vocabulaire réel du secteur", () => {
    expect(traitementConcerneApprenants("Stagiaires, et le cas échéant leur employeur")).toBe(true);
    expect(traitementConcerneApprenants("Apprenants inscrits")).toBe(true);
    expect(traitementConcerneApprenants("Clients, stagiaires payeurs, financeurs")).toBe(true);
    expect(traitementConcerneApprenants("Toute personne exerçant ses droits")).toBe(true);
  });

  it("écarte les traitements qui ne portent pas sur des apprenants", () => {
    expect(traitementConcerneApprenants("Prospects, contacts en entreprise")).toBe(false);
    expect(traitementConcerneApprenants("Formateurs salariés, intervenants indépendants, sous-traitants")).toBe(false);
  });

  it("écarte une mention absente plutôt que de l'attribuer à tout le monde", () => {
    // Une ligne de registre sans personnes concernées est une
    // non-conformité article 30 : l'écran la compte et le dit, il ne la
    // range pas d'office chez les apprenants.
    expect(traitementConcerneApprenants(null)).toBe(false);
    expect(traitementConcerneApprenants("   ")).toBe(false);
  });

  it("retient la bonne part du registre type livré avec Jalon", () => {
    const concernes = STARTER_REGISTER.filter((p) => traitementConcerneApprenants(p.dataSubjects)).map((p) => p.name);
    expect(concernes).toContain("Gestion des inscriptions et des dossiers de formation");
    expect(concernes).toContain("Prise en compte des situations de handicap");
    expect(concernes).not.toContain("Prospection commerciale et suivi des prospects");
    expect(concernes).not.toContain("Gestion des formateurs, intervenants et sous-traitants");
  });
});

describe("dateObtention", () => {
  const creation = new Date("2024-03-01T00:00:00Z");

  it("préfère la signature du contrat à la création du dossier", () => {
    const signature = new Date("2024-03-10T00:00:00Z");
    expect(dateObtention([signature], creation)).toEqual({ date: signature, source: "signature" });
  });

  it("retient la plus ancienne signature — un avenant ne redémarre pas le compteur", () => {
    const premiere = new Date("2024-03-10T00:00:00Z");
    const avenant = new Date("2026-01-15T00:00:00Z");
    expect(dateObtention([avenant, premiere], creation)).toEqual({ date: premiere, source: "signature" });
  });

  it("retombe sur la création quand rien n'a été signé", () => {
    expect(dateObtention([], creation)).toEqual({ date: creation, source: "creation" });
    expect(dateObtention([null, undefined], creation)).toEqual({ date: creation, source: "creation" });
  });
});
