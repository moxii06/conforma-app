// Shared between the invoice form, BPF report, and its export — BPF §5.13
// groups learner hours by legal status category and revenue by funding
// origin; these are the two groupings the Cerfa n°10443 form actually asks
// for.
export const LEARNER_CATEGORY_LABELS: Record<string, string> = {
  employee: "Salariés",
  jobseeker: "Demandeurs d'emploi",
  individual: "Particuliers",
  apprentice: "Apprentis",
  unset: "Non renseigné",
};

export const FUNDING_ORIGIN_LABELS: Record<string, string> = {
  company: "Entreprise",
  opco: "OPCO",
  public: "Financement public",
  individual: "Particulier",
  unset: "Non renseigné",
};

// Client feedback: at enrollment time (any entry point), staff should be
// able to say which category a learner falls into and, when that implies an
// employer is footing the bill, capture that employer's identity right
// there. Kept here (no server-only imports) so client components can use it
// without pulling in lib/enrollment.ts's prisma import.
export const LEARNER_CATEGORY_VALUES = ["employee", "jobseeker", "individual", "apprentice"] as const;
export const COMPANY_FUNDED_CATEGORIES = new Set<string>(["employee", "apprentice"]);
