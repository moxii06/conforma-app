"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { LearnerCategoryFields, EMPTY_COMPANY_FIELDS, toCompanyInput, type CompanyFieldsState } from "@/components/LearnerCategoryFields";
import { ContactSearchInput, type ContactHit } from "@/components/ContactSearchInput";
import { Button } from "@/components/ui";

type CategoryPayload = { learnerCategory?: string; company?: ReturnType<typeof toCompanyInput> };

export type LearnerInput =
  | ({ contactId: string } & CategoryPayload)
  | ({ firstName: string; lastName: string; email: string; phone?: string } & CategoryPayload);

// Shared "pick a person" building block for enrolling learners: search
// among contacts already in the CRM, or type a brand-new one in on the
// spot. Used both inline during course creation (CreateCourseForm) and
// after the fact from the course catalog (EnrollLearnerPanel) — the two
// callers differ only in what they do with the result (accumulate locally
// vs. POST immediately), so that's left to onSelect.
export function PersonPicker({ onSelect }: { onSelect: (input: LearnerInput, label: string) => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState<CompanyFieldsState>(EMPTY_COMPANY_FIELDS);

  function categoryPayload(): CategoryPayload {
    return { learnerCategory: category || undefined, company: toCompanyInput(category, company) };
  }

  function resetCategory() {
    setCategory("");
    setCompany(EMPTY_COMPANY_FIELDS);
  }

  function pickExisting(c: ContactHit) {
    onSelect({ contactId: c.id, ...categoryPayload() }, `${c.firstName} ${c.lastName}`);
    resetCategory();
  }

  function submitNew() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    onSelect(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        ...categoryPayload(),
      },
      `${firstName.trim()} ${lastName.trim()}`
    );
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    resetCategory();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-[11.5px]">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`px-2 py-1 rounded-md font-medium ${mode === "existing" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
        >
          Apprenant existant
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`px-2 py-1 rounded-md font-medium ${mode === "new" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
        >
          Nouvel apprenant
        </button>
      </div>

      <LearnerCategoryFields category={category} onCategoryChange={setCategory} company={company} onCompanyChange={setCompany} />

      {mode === "existing" ? (
        <ContactSearchInput onSelect={pickExisting} />
      ) : (
        // A plain div, not a <form> — this renders inside CreateCourseForm's
        // own outer <form>, and HTML doesn't allow nested forms (the browser
        // silently drops/mis-parses them, which used to make this control a
        // no-op click). Enter-to-submit is wired manually instead.
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Prénom"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Nom"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Email"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Téléphone (optionnel)"
              className="flex-1 bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-ink-soft"
            />
          </div>
          <Button type="button" size="sm" onClick={submitNew} className="self-start">
            <UserPlus size={13} /> Ajouter cet apprenant
          </Button>
        </div>
      )}
    </div>
  );
}
