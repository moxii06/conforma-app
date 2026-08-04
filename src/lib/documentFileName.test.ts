import { describe, it, expect } from "vitest";
import { safeFileStem, safeUploadName } from "./documentSending";

// Régression signalée par le client : le PDF reçu s'appelait « Bilan
// intermdiaire », le « é » ayant disparu. Le filtre était basé sur \w, qui
// ne couvre que [A-Za-z0-9_] — donc aucune lettre accentuée ne survivait.
describe("safeFileStem", () => {
  it("conserve les accents français", () => {
    expect(safeFileStem("Bilan intermédiaire")).toBe("Bilan intermédiaire");
    expect(safeFileStem("Évaluation à chaud — février")).toBe("Évaluation à chaud février");
    expect(safeFileStem("Convention de coopération")).toBe("Convention de coopération");
  });

  it("conserve la ponctuation anodine d'un titre", () => {
    expect(safeFileStem("Contrat n°2 - Dupont")).toBe("Contrat n 2 - Dupont");
    expect(safeFileStem("Attestation d'assiduité")).toBe("Attestation d'assiduité");
  });

  it("neutralise ce qui casserait un chemin de stockage", () => {
    expect(safeFileStem("../../etc/passwd")).not.toContain("/");
    expect(safeFileStem("../../etc/passwd")).not.toContain("..");
    expect(safeFileStem("dossier\\sous-dossier")).not.toContain("\\");
  });

  it("ne produit jamais un nom vide ni un fichier caché", () => {
    expect(safeFileStem("")).toBe("document");
    expect(safeFileStem("///")).toBe("document");
    expect(safeFileStem(".gitignore")).toBe("gitignore");
  });

  it("borne la longueur", () => {
    expect(safeFileStem("é".repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describe("safeUploadName", () => {
  it("garde l'extension et nettoie le reste", () => {
    expect(safeUploadName("Devis février.pdf")).toBe("Devis février.pdf");
    expect(safeUploadName("../../secret.pdf")).toBe("secret.pdf");
  });

  it("gère un fichier sans extension", () => {
    expect(safeUploadName("noté")).toBe("noté");
  });
});
