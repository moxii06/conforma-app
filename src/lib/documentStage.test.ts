import { describe, it, expect } from "vitest";
import { DOCUMENT_CATEGORIES } from "./documentCategories";
import { MOMENT_PAR_CATEGORIE, estPertinentPourProspect } from "./documentStage";

describe("moment du parcours", () => {
  it("couvre tout le catalogue", () => {
    expect(Object.keys(MOMENT_PAR_CATEGORIE).sort()).toEqual([...DOCUMENT_CATEGORIES].sort());
  });

  it("propose au prospect ce qui l'aide à décider et à s'inscrire", () => {
    for (const c of ["needs_assessment", "cgv", "contrat_formation", "convention", "handicap_partners"]) {
      expect(estPertinentPourProspect(c)).toBe(true);
    }
  });

  it("écarte du prospect ce qui suppose quelqu'un d'inscrit", () => {
    for (const c of ["interim_report", "final_report", "results_summary", "attendance_sheet", "eval_hot", "eval_cold"]) {
      expect(estPertinentPourProspect(c)).toBe(false);
    }
  });

  it("garde la convocation et le livret côté prospect", () => {
    // Ce sont les documents par lesquels un prospect cesse d'en être un :
    // les reléguer obligerait à ouvrir « voir tous les modèles » pour le
    // geste le plus courant de l'écran.
    expect(estPertinentPourProspect("convocation")).toBe(true);
    expect(estPertinentPourProspect("welcome_booklet")).toBe(true);
    expect(estPertinentPourProspect("internal_rules")).toBe(true);
  });

  it("ne relègue jamais un modèle « Autre » ni une catégorie inconnue", () => {
    // Ils viennent de l'organisme, qui sait mieux que cette table à quoi
    // ils servent.
    expect(estPertinentPourProspect("other")).toBe(true);
    expect(estPertinentPourProspect("modele_maison")).toBe(true);
  });
});
