import { describe, it, expect } from "vitest";
import { ordonnerDepuis, etapeSuivante, executerChaine, diagnosticChaine, type EtapeCron } from "./cronRunner";

/**
 * Horloge fausse : le temps n'avance que quand une étape le dit. Aucun
 * `setTimeout`, aucune attente réelle — la logique de budget se teste
 * exactement, pas approximativement.
 */
function horlogeFausse(depart = 0) {
  let t = depart;
  return { lire: () => t, avancer: (ms: number) => { t += ms; } };
}

function etape(nom: string, coutMs = 0, horloge?: { avancer: (ms: number) => void }, jette = false): EtapeCron {
  return {
    nom,
    libelle: nom,
    executer: async () => {
      horloge?.avancer(coutMs);
      if (jette) throw new Error(`échec ${nom}`);
      return { fait: nom };
    },
  };
}

const A = etape("a");
const B = etape("b");
const C = etape("c");

describe("ordonnerDepuis", () => {
  it("part du début quand aucun point de reprise n'est enregistré", () => {
    expect(ordonnerDepuis([A, B, C], null).map((e) => e.nom)).toEqual(["a", "b", "c"]);
  });

  it("fait tourner la chaîne pour commencer au point de reprise", () => {
    expect(ordonnerDepuis([A, B, C], "b").map((e) => e.nom)).toEqual(["b", "c", "a"]);
    expect(ordonnerDepuis([A, B, C], "c").map((e) => e.nom)).toEqual(["c", "a", "b"]);
  });

  it("repart du début si le point de reprise ne correspond à aucune étape", () => {
    // Cas réel : une étape renommée ou retirée entre deux déploiements.
    expect(ordonnerDepuis([A, B, C], "disparue").map((e) => e.nom)).toEqual(["a", "b", "c"]);
  });
});

describe("etapeSuivante", () => {
  it("boucle sur la première après la dernière", () => {
    expect(etapeSuivante([A, B, C], "c")).toBe("a");
    expect(etapeSuivante([A, B, C], "a")).toBe("b");
  });
});

describe("executerChaine", () => {
  it("exécute tout et signale un tour complet quand le budget suffit", async () => {
    const p = await executerChaine({ etapes: [A, B, C], depart: null, budgetMs: 1000, horloge: () => 0 });
    expect(p.resultats.map((r) => r.nom)).toEqual(["a", "b", "c"]);
    expect(p.differees).toEqual([]);
    expect(p.tourComplet).toBe(true);
    expect(p.prochainDepart).toBe("a");
  });

  it("diffère les étapes qui ne tiennent pas dans le budget", async () => {
    const h = horlogeFausse();
    const etapes = [etape("a", 30_000, h), etape("b", 30_000, h), etape("c", 30_000, h)];
    const p = await executerChaine({ etapes, depart: null, budgetMs: 40_000, horloge: h.lire });
    // « a » part, coûte 30 s ; « b » part car 30 s < 40 s ; à 60 s, « c » ne part plus.
    expect(p.resultats.map((r) => r.nom)).toEqual(["a", "b"]);
    expect(p.differees).toEqual(["c"]);
    expect(p.tourComplet).toBe(false);
  });

  it("reprend le lendemain à l'étape différée — la famine du dernier maillon", async () => {
    const etapes = [etape("a", 30_000), etape("b", 30_000), etape("c", 30_000)];

    const h1 = horlogeFausse();
    const chaine1 = [etape("a", 30_000, h1), etape("b", 30_000, h1), etape("c", 30_000, h1)];
    const j1 = await executerChaine({ etapes: chaine1, depart: null, budgetMs: 40_000, horloge: h1.lire });
    expect(j1.prochainDepart).toBe("c");

    // Le lendemain, « c » passe en tête : c'est toute la correction. Avant,
    // elle était systématiquement la dernière, donc systématiquement coupée.
    const h2 = horlogeFausse();
    const chaine2 = [etape("a", 30_000, h2), etape("b", 30_000, h2), etape("c", 30_000, h2)];
    const j2 = await executerChaine({ etapes: chaine2, depart: j1.prochainDepart, budgetMs: 40_000, horloge: h2.lire });
    expect(j2.resultats.map((r) => r.nom)).toEqual(["c", "a"]);
    expect(j2.prochainDepart).toBe("b");
    void etapes;
  });

  it("revient à l'ordre nominal dès qu'un tour complet passe", async () => {
    // Sans cette remise à zéro, un passage coupé juste avant la dernière
    // étape la ferait passer en tête — et elle y resterait à vie, alors
    // même que tout tient de nouveau dans le temps imparti. La rotation
    // est un rattrapage, pas un état.
    const p = await executerChaine({ etapes: [A, B, C], depart: "c", budgetMs: 1000, horloge: () => 0 });
    expect(p.resultats.map((r) => r.nom)).toEqual(["c", "a", "b"]);
    expect(p.tourComplet).toBe(true);
    expect(p.prochainDepart).toBe("a");
  });

  it("lance toujours la première étape, même avec un budget nul", async () => {
    // Sinon un budget mal réglé produirait un passage qui ne fait rien et
    // se contente de faire tourner le pointeur — une panne silencieuse de
    // plus, exactement ce qu'on répare.
    const p = await executerChaine({ etapes: [A, B], depart: null, budgetMs: 0, horloge: () => 0 });
    expect(p.resultats.map((r) => r.nom)).toEqual(["a"]);
    expect(p.differees).toEqual(["b"]);
  });

  it("continue après une étape en échec et ne s'y bloque pas", async () => {
    const etapes = [etape("a", 0, undefined, true), B, C];
    const p = await executerChaine({ etapes, depart: null, budgetMs: 1000, horloge: () => 0 });
    expect(p.resultats.map((r) => r.ok)).toEqual([false, true, true]);
    expect(p.resultats[0].erreur).toContain("échec a");
    // Le point de reprise ne reste pas coincé sur l'étape en échec.
    expect(p.prochainDepart).toBe("a");
    expect(p.tourComplet).toBe(true);
  });

  it("écrit le point de reprise AVANT chaque étape", async () => {
    // C'est ce qui permet de reprendre une étape tuée en plein milieu :
    // au moment de la coupure, le point de reprise la désigne déjà.
    const vus: string[] = [];
    await executerChaine({
      etapes: [A, B, C],
      depart: null,
      budgetMs: 1000,
      horloge: () => 0,
      avantEtape: async (nom) => { vus.push(nom); },
    });
    expect(vus).toEqual(["a", "b", "c"]);
  });

  it("rend un passage vide sans planter quand la chaîne est vide", async () => {
    const p = await executerChaine({ etapes: [], depart: "a", horloge: () => 0 });
    expect(p.resultats).toEqual([]);
    expect(p.tourComplet).toBe(true);
  });
});

describe("diagnosticChaine", () => {
  const maintenant = new Date("2026-08-05T12:00:00Z");
  const ilYA = (heures: number) => new Date(maintenant.getTime() - heures * 3_600_000);

  it("alerte quand aucun passage n'a jamais abouti", () => {
    // Symptôme d'un CRON_SECRET absent ou d'une tâche non enregistrée chez
    // l'hébergeur. Se taire ici serait rejouer le défaut qu'on répare.
    expect(diagnosticChaine(null, maintenant).ton).toBe("alerte");
  });

  it("alerte quand une étape est coupée deux passages de suite, en la nommant", () => {
    const d = diagnosticChaine(
      { nextStage: "synchro_boites_mail", stalledRuns: 2, lastFullPassAt: ilYA(3) },
      maintenant
    );
    expect(d.ton).toBe("alerte");
    expect(d.texte).toContain("synchro_boites_mail");
  });

  it("alerte quand aucun tour complet n'a jamais été bouclé", () => {
    expect(diagnosticChaine({ nextStage: "a", stalledRuns: 0, lastFullPassAt: null }, maintenant).ton).toBe("alerte");
  });

  it("alerte au-delà de 48 h sans tour complet", () => {
    expect(diagnosticChaine({ nextStage: "a", stalledRuns: 0, lastFullPassAt: ilYA(49) }, maintenant).ton).toBe("alerte");
    expect(diagnosticChaine({ nextStage: "a", stalledRuns: 0, lastFullPassAt: ilYA(47) }, maintenant).ton).toBe("ok");
  });

  it("reste silencieux quand tout va bien", () => {
    const d = diagnosticChaine({ nextStage: "a", stalledRuns: 0, lastFullPassAt: ilYA(5) }, maintenant);
    expect(d.ton).toBe("ok");
    expect(d.texte).toContain("5 h");
  });

  // Une coupure isolée (redéploiement pendant le passage) ne doit pas
  // déclencher l'alerte : c'est pourquoi le seuil est à 2, pas à 1.
  it("ne s'alarme pas d'une coupure isolée", () => {
    expect(diagnosticChaine({ nextStage: "a", stalledRuns: 1, lastFullPassAt: ilYA(3) }, maintenant).ton).toBe("ok");
  });
});
