import { describe, it, expect } from "vitest";
import { repartirEnvoi, MAX_DESTINATAIRES_PAR_PASSAGE } from "./bulkSendBatch";

const gens = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}` }));

describe("repartirEnvoi", () => {
  it("sert tout le monde quand le lot tient dans un passage", () => {
    const r = repartirEnvoi({ demandes: gens(8), dejaServis: new Set() });
    expect(r.aServir).toHaveLength(8);
    expect(r.reste).toBe(0);
    expect(r.dejaServis).toBe(0);
  });

  it("s'arrête au plafond et annonce le reste au lieu d'être coupé", () => {
    // Le défaut d'origine : la boucle partait pour 65 et la plateforme la
    // tuait vers la quarantaine, sans rien dire.
    const r = repartirEnvoi({ demandes: gens(65), dejaServis: new Set() });
    expect(r.aServir).toHaveLength(MAX_DESTINATAIRES_PAR_PASSAGE);
    expect(r.reste).toBe(5);
  });

  it("saute ceux qui ont déjà reçu, et sert la suite", () => {
    const r = repartirEnvoi({ demandes: gens(10), dejaServis: new Set(["d1", "d2", "d3"]), max: 4 });
    expect(r.aServir.map((d) => d.id)).toEqual(["d4", "d5", "d6", "d7"]);
    expect(r.dejaServis).toBe(3);
    expect(r.reste).toBe(3);
  });

  it("ne sert plus rien quand tout le lot est parti", () => {
    const demandes = gens(5);
    const r = repartirEnvoi({ demandes, dejaServis: new Set(demandes.map((d) => d.id)) });
    expect(r.aServir).toHaveLength(0);
    expect(r.reste).toBe(0);
    expect(r.dejaServis).toBe(5);
  });

  // LE test de ce fichier : rejouer jusqu'à épuisement doit servir chaque
  // destinataire EXACTEMENT une fois. C'est précisément ce que l'audit
  // reprochait — « le relancer envoie les documents en double à ceux qui
  // les avaient déjà reçus ».
  it("converge : chacun servi une fois et une seule, quel que soit le nombre de passages", () => {
    const demandes = gens(203);
    const servis = new Set<string>();
    const compte = new Map<string, number>();
    let passages = 0;

    for (;;) {
      const r = repartirEnvoi({ demandes, dejaServis: servis });
      if (r.aServir.length === 0) break;
      passages++;
      for (const d of r.aServir) {
        compte.set(d.id, (compte.get(d.id) ?? 0) + 1);
        servis.add(d.id);
      }
      if (passages > 20) throw new Error("ne converge pas");
    }

    expect(servis.size).toBe(203);
    expect([...compte.values()].every((n) => n === 1)).toBe(true);
    expect(passages).toBe(Math.ceil(203 / MAX_DESTINATAIRES_PAR_PASSAGE));
  });

  it("converge aussi quand un passage a été coupé en plein milieu", () => {
    // Cas réel : la plateforme tue le processus après 37 envois sur 60. Les
    // 37 documents existent en base, les 23 autres non. Le passage suivant
    // doit reprendre à 38, pas à 1.
    const demandes = gens(100);
    const servis = new Set(demandes.slice(0, 37).map((d) => d.id));
    const r = repartirEnvoi({ demandes, dejaServis: servis });
    expect(r.aServir[0].id).toBe("d38");
    expect(r.aServir).toHaveLength(60);
    expect(r.reste).toBe(3);
  });

  it("supporte un plafond nul sans servir personne par accident", () => {
    const r = repartirEnvoi({ demandes: gens(5), dejaServis: new Set(), max: 0 });
    expect(r.aServir).toHaveLength(0);
    expect(r.reste).toBe(5);
  });
});
