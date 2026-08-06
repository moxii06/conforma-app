import { describe, expect, it } from "vitest";
import { aUnEnTete, lignesEnTete, mentionPiedDePage, numeroDePage, type IdentiteOrganisme } from "./documentLayout";

const NOVA: IdentiteOrganisme = {
  nom: "Formations Nova",
  logoUrl: "https://blob.example/logo.png",
  formeJuridique: "SAS",
  adresseLegale: "12 rue des Chartrons\n33000 Bordeaux",
  siret: "84312345600021",
  numeroDeclarationActivite: "75331234533",
  prefectureRegion: "Nouvelle-Aquitaine",
  telephone: "05 56 00 00 00",
  email: "contact@formations-nova.fr",
};

const VIDE: IdentiteOrganisme = {
  nom: "",
  logoUrl: null,
  formeJuridique: null,
  adresseLegale: null,
  siret: null,
  numeroDeclarationActivite: null,
  prefectureRegion: null,
  telephone: null,
  email: null,
};

describe("lignesEnTete", () => {
  it("rend identité, adresse et contact", () => {
    expect(lignesEnTete(NOVA)).toEqual([
      "Formations Nova — SAS",
      "12 rue des Chartrons, 33000 Bordeaux",
      "05 56 00 00 00 · contact@formations-nova.fr",
    ]);
  });

  it("met l'adresse sur une seule ligne", () => {
    // Un en-tête qui déborde repousse le contrat d'une page.
    expect(lignesEnTete({ ...NOVA, adresseLegale: "A\n\n  B  \nC" })[1]).toBe("A, B, C");
  });

  it("saute ce qui n'est pas renseigné, sans laisser de trou", () => {
    expect(lignesEnTete({ ...NOVA, formeJuridique: null, telephone: null, email: null })).toEqual([
      "Formations Nova",
      "12 rue des Chartrons, 33000 Bordeaux",
    ]);
  });

  it("traite une chaîne blanche comme une absence", () => {
    expect(lignesEnTete({ ...VIDE, nom: "   " })).toEqual([]);
  });
});

describe("mentionPiedDePage", () => {
  it("porte le nom, le SIRET et la déclaration d'activité", () => {
    expect(mentionPiedDePage(NOVA)).toBe(
      "Formations Nova · SIRET 84312345600021 · Déclaration d'activité n° 75331234533 auprès du préfet de la région Nouvelle-Aquitaine — cet enregistrement ne vaut pas agrément de l'État",
    );
  });

  it("n'annonce JAMAIS le numéro sans la précision qui l'accompagne", () => {
    // Art. L.6352-12 : la mention seule serait trompeuse. Les deux ne
    // peuvent pas être séparées, c'est la même chaîne.
    const sansPrefecture = mentionPiedDePage({ ...NOVA, prefectureRegion: null });
    expect(sansPrefecture).toContain("75331234533");
    expect(sansPrefecture).toContain("ne vaut pas agrément de l'État");
    expect(sansPrefecture).not.toContain("préfet de la région");
  });

  it("ne dit rien du numéro quand il n'est pas renseigné", () => {
    const sansNda = mentionPiedDePage({ ...NOVA, numeroDeclarationActivite: null });
    expect(sansNda).toBe("Formations Nova · SIRET 84312345600021");
    expect(sansNda).not.toContain("agrément");
  });

  it("rend une chaîne vide plutôt qu'une ligne de séparateurs", () => {
    expect(mentionPiedDePage(VIDE)).toBe("");
  });
});

describe("aUnEnTete", () => {
  it("est vrai dès qu'il y a un logo, même sans mentions", () => {
    expect(aUnEnTete({ ...VIDE, logoUrl: "https://blob.example/l.png" })).toBe(true);
  });

  it("est vrai dès qu'il y a une ligne d'identité, même sans logo", () => {
    expect(aUnEnTete({ ...VIDE, nom: "Formations Nova" })).toBe(true);
  });

  it("est faux quand il n'y a rien — mieux vaut pas d'en-tête qu'un cadre vide", () => {
    expect(aUnEnTete(VIDE)).toBe(false);
  });
});

describe("numeroDePage", () => {
  it("formule la pagination en un seul endroit", () => {
    expect(numeroDePage(2, 7)).toBe("Page 2 sur 7");
  });
});
