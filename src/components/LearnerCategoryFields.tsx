"use client";

import { LEARNER_CATEGORY_LABELS, COMPANY_FUNDED_CATEGORIES } from "@/lib/bpfCategories";

export type CompanyFieldsState = {
  name: string;
  siret: string;
  address: string;
  responsableFirstName: string;
  responsableLastName: string;
  responsableEmail: string;
  responsablePhone: string;
};

export const EMPTY_COMPANY_FIELDS: CompanyFieldsState = {
  name: "",
  siret: "",
  address: "",
  responsableFirstName: "",
  responsableLastName: "",
  responsableEmail: "",
  responsablePhone: "",
};

// Turns the local form state into the shape the enroll APIs expect —
// undefined (not sent) unless staff picked a company-funded category and
// actually typed a company name, so a half-touched sub-form doesn't create
// an empty Company record.
export function toCompanyInput(category: string, company: CompanyFieldsState) {
  if (!COMPANY_FUNDED_CATEGORIES.has(category) || !company.name.trim()) return undefined;
  return {
    name: company.name.trim(),
    siret: company.siret.trim() || undefined,
    address: company.address.trim() || undefined,
    responsableFirstName: company.responsableFirstName.trim() || undefined,
    responsableLastName: company.responsableLastName.trim() || undefined,
    responsableEmail: company.responsableEmail.trim() || undefined,
    responsablePhone: company.responsablePhone.trim() || undefined,
  };
}

// Shared "quelle catégorie d'apprenant, et si c'est une entreprise qui
// paie, laquelle" block — reused wherever a learner is enrolled (course
// catalog, course creation, session enrollment) so the capture logic lives
// in one place. Category defaults to "non renseigné" (empty string), a
// real, expected state until staff fills it in later.
export function LearnerCategoryFields({
  category,
  onCategoryChange,
  company,
  onCompanyChange,
}: {
  category: string;
  onCategoryChange: (value: string) => void;
  company: CompanyFieldsState;
  onCompanyChange: (value: CompanyFieldsState) => void;
}) {
  const isCompanyFunded = COMPANY_FUNDED_CATEGORIES.has(category);

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
      >
        <option value="">Non renseigné</option>
        {Object.entries(LEARNER_CATEGORY_LABELS)
          .filter(([key]) => key !== "unset")
          .map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
      </select>

      {isCompanyFunded && (
        <div className="flex flex-col gap-1.5 border border-line rounded-md p-2 bg-[#FAF9F6]">
          <div className="text-[11px] font-medium text-slate">Entreprise</div>
          <div className="flex gap-1.5">
            <input
              value={company.name}
              onChange={(e) => onCompanyChange({ ...company, name: e.target.value })}
              placeholder="Nom de l'entreprise"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={company.siret}
              onChange={(e) => onCompanyChange({ ...company, siret: e.target.value })}
              placeholder="SIRET (optionnel)"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
          <input
            value={company.address}
            onChange={(e) => onCompanyChange({ ...company, address: e.target.value })}
            placeholder="Adresse (optionnel)"
            className="bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
          />
          <div className="text-[11px] font-medium text-slate mt-1">Responsable</div>
          <div className="flex gap-1.5">
            <input
              value={company.responsableFirstName}
              onChange={(e) => onCompanyChange({ ...company, responsableFirstName: e.target.value })}
              placeholder="Prénom"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={company.responsableLastName}
              onChange={(e) => onCompanyChange({ ...company, responsableLastName: e.target.value })}
              placeholder="Nom"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={company.responsableEmail}
              onChange={(e) => onCompanyChange({ ...company, responsableEmail: e.target.value })}
              placeholder="Email"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={company.responsablePhone}
              onChange={(e) => onCompanyChange({ ...company, responsablePhone: e.target.value })}
              placeholder="Téléphone"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
        </div>
      )}
    </div>
  );
}
