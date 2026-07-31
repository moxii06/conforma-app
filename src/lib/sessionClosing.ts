// Les preuves du parcours, apprenant par apprenant, pour une session.
//
// Cette grille n'apparaissait qu'une fois la session TERMINÉE. Or quatre des
// sept preuves doivent exister AVANT le premier jour : le recueil des
// besoins analyse la situation à l'entrée (ind. 4), le contrat doit être
// signé avant le début de l'exécution (art. L. 6353-1 du code du travail),
// la convocation doit être partie. Les découvrir après coup, c'est les
// découvrir au moment précis où plus rien ne peut être rattrapé — et un
// contrat signé après coup ne redevient jamais un contrat signé avant.
//
// D'où la notion d'échéance portée par chaque étape : une preuve manquante
// avant son échéance est un reste-à-faire ordinaire, la même preuve après
// son échéance est un trou dans le dossier. Seule la seconde catégorie
// alerte, et c'est elle qui fait hésiter avant d'archiver.

export type ClosingStage = "upcoming" | "running" | "past";

export type ClosingStepKey =
  | "needs"
  | "contract"
  | "convocation"
  | "attendance"
  | "hot"
  | "cold"
  | "certificate";

export type ClosingStep = {
  key: ClosingStepKey;
  label: string;
  done: boolean;
  /** L'échéance est passée : une preuve encore absente est un trou, pas un reste-à-faire. */
  due: boolean;
  /** Précision affichée au survol, quand la preuve est graduelle (émargement). */
  detail?: string;
};

export type ClosingRow = {
  dossierId: string;
  contactName: string;
  steps: ClosingStep[];
  /** Preuves déjà exigibles et toujours absentes pour cet apprenant. */
  missingDue: number;
};

export type SessionClosing = {
  stage: ClosingStage;
  rows: ClosingRow[];
  /** Total des preuves exigibles manquantes. C'est ce chiffre qui fait hésiter avant d'archiver. */
  missingDue: number;
  /** Apprenants dont aucune preuve exigible ne manque. */
  readyCount: number;
  total: number;
};

export type ClosingDossier = {
  dossierId: string;
  contactName: string;
  needsAssessmentDone: boolean;
  contractSigned: boolean;
  convocationSent: boolean;
  evaluationHotDone: boolean;
  evaluationColdDone: boolean;
  certificateIssued: boolean;
  /** Demi-journées effectivement signées par cet apprenant. */
  halfDaysSigned: number;
  /** Demi-journées prévues au calendrier. 0 = aucune feuille d'émargement configurée. */
  halfDaysExpected: number;
};

export function sessionStage(startsAt: Date, endsAt: Date, now: Date): ClosingStage {
  if (endsAt < now) return "past";
  if (startsAt <= now) return "running";
  return "upcoming";
}

export function buildSessionClosing(
  dossiers: ClosingDossier[],
  startsAt: Date,
  endsAt: Date,
  now: Date,
): SessionClosing {
  const stage = sessionStage(startsAt, endsAt, now);
  // Deux échéances seulement. Ce qui conditionne l'entrée en formation est dû
  // au premier jour ; ce qui la conclut est dû au dernier. Découper plus fin
  // (l'émargement demi-journée par demi-journée) ferait clignoter la grille
  // pendant la session sans que personne ne puisse rien y faire sur le moment.
  const beforeDue = startsAt <= now;
  const afterDue = endsAt < now;

  const rows = dossiers.map((d) => {
    const steps: ClosingStep[] = [
      { key: "needs", label: "Recueil", done: d.needsAssessmentDone, due: beforeDue },
      { key: "contract", label: "Contrat", done: d.contractSigned, due: beforeDue },
      { key: "convocation", label: "Convocation", done: d.convocationSent, due: beforeDue },
    ];

    // Sans journées au calendrier il n'y a pas de feuille à signer : l'étape
    // est retirée plutôt qu'affichée en rouge. Signaler un émargement absent
    // là où l'organisme n'en attend aucun transformerait l'alerte en bruit,
    // et une alerte qu'on apprend à ignorer ne protège plus de rien.
    if (d.halfDaysExpected > 0) {
      steps.push({
        key: "attendance",
        label: "Émargement",
        done: d.halfDaysSigned >= d.halfDaysExpected,
        due: afterDue,
        detail: `${d.halfDaysSigned}/${d.halfDaysExpected} demi-journées signées`,
      });
    }

    steps.push(
      { key: "hot", label: "Éval. à chaud", done: d.evaluationHotDone, due: afterDue },
      { key: "cold", label: "Éval. à froid", done: d.evaluationColdDone, due: afterDue },
      { key: "certificate", label: "Attestation", done: d.certificateIssued, due: afterDue },
    );

    return {
      dossierId: d.dossierId,
      contactName: d.contactName,
      steps,
      missingDue: steps.filter((s) => s.due && !s.done).length,
    };
  });

  return {
    stage,
    rows,
    missingDue: rows.reduce((sum, r) => sum + r.missingDue, 0),
    readyCount: rows.filter((r) => r.missingDue === 0).length,
    total: rows.length,
  };
}

/** Titre du bloc — « Clôture » avant le dernier jour serait un contresens. */
export function closingTitle(stage: ClosingStage): string {
  if (stage === "past") return "Clôture de la session";
  if (stage === "running") return "Session en cours";
  return "Avant la session";
}
