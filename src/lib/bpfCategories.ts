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
