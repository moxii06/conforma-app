import { describe, it, expect } from "vitest";
import { DOCUMENT_CATEGORIES } from "./documentCategories";
import {
  DESTINATAIRE_PAR_CATEGORIE,
  CATEGORIES_FOURNISSEUR,
  destinataireDe,
  estPourClient,
} from "./documentAudience";

describe("destinataire des documents", () => {
  it("classe les trois contrats fournisseur", () => {
    expect(CATEGORIES_FOURNISSEUR.sort()).toEqual(
      ["subcontractor_contract", "trainer_contract", "video_shoot_contract"].sort(),
    );
  });

  it("n'exclut aucun document que le client doit recevoir", () => {
    for (const c of ["convention", "contrat_formation", "cgv", "needs_assessment", "convocation"]) {
      expect(estPourClient(c)).toBe(true);
    }
  });

  it("couvre tout le catalogue, sans trou", () => {
    // Le garde-fou : une catégorie ajoutée au catalogue sans être rangée
    // ici tomberait dans le defaut « client » et se retrouverait proposee a
    // un prospect. Le typage l'attrape a la compilation, ce test au cas ou
    // la table serait elargie a la main.
    for (const c of DOCUMENT_CATEGORIES) {
      expect(DESTINATAIRE_PAR_CATEGORIE[c]).toBeDefined();
    }
    expect(Object.keys(DESTINATAIRE_PAR_CATEGORIE).sort()).toEqual([...DOCUMENT_CATEGORIES].sort());
  });

  it("traite une catégorie inconnue comme cliente", () => {
    // Assumé : les catégories fournisseur sont fermées et fournies par
    // Jalon. Ce qu'un organisme crée pour son usage s'adresse à ses clients.
    expect(destinataireDe("modele_maison_de_l_organisme")).toBe("client");
    expect(estPourClient("")).toBe(true);
  });

  it("range « autre » du côté client", () => {
    expect(estPourClient("other")).toBe(true);
  });
});
