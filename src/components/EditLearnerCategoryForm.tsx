"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LearnerCategoryFields, EMPTY_COMPANY_FIELDS, toCompanyInput, type CompanyFieldsState } from "@/components/LearnerCategoryFields";
import { LEARNER_CATEGORY_LABELS } from "@/lib/bpfCategories";

type Company = {
  name: string;
  siret: string | null;
  address: string | null;
  responsableFirstName: string | null;
  responsableLastName: string | null;
  responsableEmail: string | null;
  responsablePhone: string | null;
};

export function EditLearnerCategoryForm({
  contactId,
  learnerCategory,
  company,
}: {
  contactId: string;
  learnerCategory: string | null;
  company: Company | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(learnerCategory ?? "");
  const [companyFields, setCompanyFields] = useState<CompanyFieldsState>(
    company
      ? {
          name: company.name,
          siret: company.siret ?? "",
          address: company.address ?? "",
          responsableFirstName: company.responsableFirstName ?? "",
          responsableLastName: company.responsableLastName ?? "",
          responsableEmail: company.responsableEmail ?? "",
          responsablePhone: company.responsablePhone ?? "",
        }
      : EMPTY_COMPANY_FIELDS
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/crm/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learnerCategory: category || undefined,
        company: toCompanyInput(category, companyFields),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] text-ink">{LEARNER_CATEGORY_LABELS[learnerCategory ?? "unset"]}</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink self-start mt-1"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <LearnerCategoryFields category={category} onCategoryChange={setCategory} company={companyFields} onCompanyChange={setCompanyFields} />
      <div className="flex items-center gap-2.5 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-slate hover:text-ink">
          Annuler
        </button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
