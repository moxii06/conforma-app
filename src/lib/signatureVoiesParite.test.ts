import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Garde-fou de parité des trois voies de signature.
 *
 * Ce que ce test prouve, et ce qu'il ne prouve pas — à lire avant de s'y
 * fier. Il LIT LE TEXTE des trois routes et vérifie qu'elles passent toutes
 * par `traiterDocumentSigne` et qu'aucune ne rappelle un effet isolément.
 * C'est une vérification textuelle : elle n'exécute aucune route, ne touche
 * aucune base, et ne dit rien de ce qui se passe réellement à l'exécution.
 *
 * Pourquoi elle existe quand même. Le défaut corrigé ici n'était pas une
 * erreur de logique mais un OUBLI DE RECOPIE : « Marquer signé » appelait
 * deux effets sur trois, et un contrat signé en présentiel ne produisait
 * donc aucune facture d'échéancier. Un oubli de recopie se voit dans le
 * texte — c'est précisément le genre de défaut qu'une lecture mécanique
 * attrape et qu'un test de comportement, ici impossible (les routes
 * importent Prisma, que la config Vitest de ce projet ne peut pas charger),
 * n'aurait de toute façon pas mieux attrapé.
 *
 * La vraie garantie est ailleurs et elle est plus forte : les trois effets
 * ne sont plus exportés par lib/documentSending.ts, donc une route ne PEUT
 * plus en appeler un seul — le compilateur refuse. Ce test couvre ce que le
 * compilateur ne voit pas : une route qui n'appellerait plus rien du tout.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));

const VOIES = [
  { nom: "apprenant qui signe en ligne", fichier: "src/app/api/documents/[id]/sign/route.ts" },
  { nom: "webhook Yousign", fichier: "src/app/api/webhooks/yousign/[organizationId]/route.ts" },
  { nom: "« Marquer signé » (retour papier)", fichier: "src/app/api/documents/[id]/mark-signed/route.ts" },
];

// Les trois effets d'une signature. Aucune route ne doit les appeler
// directement : c'est en les appelant une par une que les voies avaient
// divergé.
const EFFETS_ISOLES = [
  "notifyDocumentSigned(",
  "syncParcoursFromSignedDocument(",
  "materialiseScheduleFromSignedDocument(",
];

function lireRoute(fichier: string): string {
  const chemin = path.join(RACINE, fichier);
  // Un renommage de route doit faire échouer ce test bruyamment plutôt que
  // le vider de son sens en silence.
  expect(existsSync(chemin), `Route introuvable : ${fichier}. Si elle a été déplacée, mettre à jour ce test.`).toBe(
    true,
  );
  return readFileSync(chemin, "utf8");
}

describe("parité des trois voies de signature", () => {
  for (const { nom, fichier } of VOIES) {
    it(`${nom} passe par traiterDocumentSigne`, () => {
      expect(lireRoute(fichier)).toContain("traiterDocumentSigne(");
    });

    it(`${nom} n'appelle aucun effet isolément`, () => {
      const source = lireRoute(fichier);
      for (const effet of EFFETS_ISOLES) {
        expect(source, `${fichier} appelle ${effet} au lieu de passer par traiterDocumentSigne`).not.toContain(effet);
      }
    });
  }

  it("couvre bien trois voies distinctes", () => {
    // Si une quatrième voie de signature apparaît un jour, elle doit être
    // ajoutée ici — sinon ce garde-fou la laisserait diverger tranquillement.
    expect(new Set(VOIES.map((v) => v.fichier)).size).toBe(3);
  });
});
