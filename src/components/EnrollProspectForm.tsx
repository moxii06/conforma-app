"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LearnerCategoryFields, EMPTY_COMPANY_FIELDS, toCompanyInput, type CompanyFieldsState } from "@/components/LearnerCategoryFields";

type Suggestion = { opportunityId: string; contactName: string };

export function EnrollProspectForm({ sessionId, suggestions }: { sessionId: string; suggestions: Suggestion[] }) {
  const router = useRouter();
  const [opportunityId, setOpportunityId] = useState(suggestions[0]?.opportunityId ?? "");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState<CompanyFieldsState>(EMPTY_COMPANY_FIELDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnroll() {
    if (!opportunityId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/planning/sessions/${sessionId}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId,
        learnerCategory: category || undefined,
        company: toCompanyInput(category, company),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de l'inscription.");
      return;
    }
    setCategory("");
    setCompany(EMPTY_COMPANY_FIELDS);
    router.refresh();
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-[12.5px] text-slate">
        Aucun prospect avec convention signée pour cette formation. Renseignez la formation d&apos;intérêt sur une
        opportunité CRM une fois sa convention signée pour la voir apparaître ici.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <select
          value={opportunityId}
          onChange={(e) => setOpportunityId(e.target.value)}
          className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1"
        >
          {suggestions.map((s) => (
            <option key={s.opportunityId} value={s.opportunityId}>
              {s.contactName}
            </option>
          ))}
        </select>
        <button
          onClick={handleEnroll}
          disabled={loading}
          className="bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-1.5 hover:bg-ink-soft disabled:opacity-60 shrink-0"
        >
          {loading ? "…" : "Inscrire"}
        </button>
      </div>
      <LearnerCategoryFields category={category} onCategoryChange={setCategory} company={company} onCompanyChange={setCompany} />
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </div>
  );
}
