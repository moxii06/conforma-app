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

// Singular variants for pills describing one person — the BPF labels above
// are grouping headings ("Salariés"), wrong on an individual's card.
export const LEARNER_CATEGORY_SINGULAR: Record<string, string> = {
  employee: "Salarié",
  jobseeker: "Demandeur d'emploi",
  individual: "Particulier",
  apprentice: "Apprenti",
};

export const FUNDING_ORIGIN_LABELS: Record<string, string> = {
  company: "Entreprise",
  opco: "OPCO",
  public: "Financement public",
  individual: "Particulier",
  unset: "Non renseigné",
};

// Choix proposés dans le sélecteur "Origine du financement" à la création
// d'une facture — sans "unset", qui n'est jamais un choix qu'on fait mais
// l'état d'une facture jamais renseignée. Partagé entre le composeur de
// Facturation (NewInvoiceForm) et celui du CRM (PieceFinanciereTab) : mêmes
// options, même ordre, pour que les deux écrans posent exactement la même
// question — un audit BPF a trouvé qu'une facture créée depuis le CRM ne la
// posait pas du tout.
export const FUNDING_ORIGIN_SELECTABLE = Object.fromEntries(
  Object.entries(FUNDING_ORIGIN_LABELS).filter(([key]) => key !== "unset"),
);

// Client feedback: at enrollment time (any entry point), staff should be
// able to say which category a learner falls into and, when that implies an
// employer is footing the bill, capture that employer's identity right
// there. Kept here (no server-only imports) so client components can use it
// without pulling in lib/enrollment.ts's prisma import.
export const LEARNER_CATEGORY_VALUES = ["employee", "jobseeker", "individual", "apprentice"] as const;
export const COMPANY_FUNDED_CATEGORIES = new Set<string>(["employee", "apprentice"]);
