import { describe, expect, it } from "vitest";
import { AVAILABLE_MERGE_FIELDS } from "./mergeTemplate";
import { FAMILLES, LIBELLES, grouperBalises, libelleDe, prefixeDe, toutesLesBalisesGroupees } from "./mergeFieldCatalog";

describe("mergeFieldCatalog — couverture", () => {
  // Le garde-fou qui compte. AVAILABLE_MERGE_FIELDS est dérivé du résolveur :
  // ajouter un champ au moteur de fusion sans le nommer ici ferait réapparaître
  // une clé brute dans l'éditeur, exactement ce qu'on vient de corriger.
  it("nomme chaque balise réellement résolue", () => {
    const sansLibelle = AVAILABLE_MERGE_FIELDS.filter((c) => !(c in LIBELLES));
    expect(sansLibelle).toEqual([]);
  });

  it("ne nomme aucune balise qui n'existe plus", () => {
    const orphelines = Object.keys(LIBELLES).filter((c) => !AVAILABLE_MERGE_FIELDS.includes(c));
    expect(orphelines).toEqual([]);
  });

  it("range chaque balise dans une famille déclarée", () => {
    const prefixesConnus = new Set(FAMILLES.map((f) => f.prefixe));
    const orphelines = AVAILABLE_MERGE_FIELDS.filter((c) => !prefixesConnus.has(prefixeDe(c)));
    expect(orphelines).toEqual([]);
  });

  it("n'égare aucune balise au regroupement", () => {
    const groupees = toutesLesBalisesGroupees().flatMap((g) => g.balises.map((b) => b.cle));
    expect(groupees.sort()).toEqual([...AVAILABLE_MERGE_FIELDS].sort());
  });
});

describe("mergeFieldCatalog — regroupement", () => {
  it("suit l'ordre des familles, pas l'ordre alphabétique", () => {
    const titres = toutesLesBalisesGroupees().map((g) => g.famille.titre);
    expect(titres[0]).toBe("L'apprenant");
    expect(titres.indexOf("L'apprenant")).toBeLessThan(titres.indexOf("Votre organisme"));
  });

  it("distingue l'entreprise cliente de l'organisme de formation", () => {
    // Les deux ont un « nom » et un « SIRET » : c'est la famille qui dit
    // laquelle des deux parties au contrat on désigne.
    expect(libelleDe("company.name")).toBe("Raison sociale");
    expect(libelleDe("organization.name")).toBe("Nom");
    const familles = toutesLesBalisesGroupees();
    expect(familles.find((g) => g.famille.prefixe === "company")!.famille.titre).toBe("L'entreprise cliente");
    expect(familles.find((g) => g.famille.prefixe === "organization")!.famille.titre).toBe("Votre organisme");
  });

  it("produit la balise prête à insérer", () => {
    const apprenant = toutesLesBalisesGroupees().find((g) => g.famille.prefixe === "contact")!;
    expect(apprenant.balises.find((b) => b.cle === "contact.firstName")).toEqual({
      cle: "contact.firstName",
      tag: "{{contact.firstName}}",
      libelle: "Prénom",
    });
  });

  it("classe « today », qui n'a pas de préfixe", () => {
    const divers = toutesLesBalisesGroupees().find((g) => g.famille.prefixe === "");
    expect(divers?.balises.map((b) => b.cle)).toEqual(["today"]);
  });
});

describe("mergeFieldCatalog — recherche", () => {
  it("filtre sur le libellé français", () => {
    const trouve = toutesLesBalisesGroupees("prérequis").flatMap((g) => g.balises.map((b) => b.cle));
    expect(trouve).toEqual(["course.prerequisites"]);
  });

  it("filtre aussi sur la clé technique, pour qui la connaît déjà", () => {
    const trouve = toutesLesBalisesGroupees("course.price").flatMap((g) => g.balises.map((b) => b.cle));
    expect(trouve).toEqual(["course.price"]);
  });

  it("ignore la casse et les espaces autour", () => {
    expect(toutesLesBalisesGroupees("  SIRET ").flatMap((g) => g.balises.map((b) => b.cle))).toEqual([
      "company.siret",
      "organization.siret",
      "subcontractor.siret",
    ]);
  });

  it("ne rend aucune famille vide quand rien ne correspond", () => {
    expect(toutesLesBalisesGroupees("zzzz")).toEqual([]);
  });

  it("ne propose que les balises passées, pas tout le catalogue", () => {
    // Les composeurs restreignent parfois le jeu de balises à ce que le
    // contexte sait résoudre : le regroupement ne doit jamais en réintroduire.
    const groupes = grouperBalises(["contact.firstName", "today"]);
    expect(groupes.flatMap((g) => g.balises.map((b) => b.cle))).toEqual(["contact.firstName", "today"]);
  });
});
