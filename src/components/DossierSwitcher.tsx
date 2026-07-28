"use client";

import { useRouter } from "next/navigation";

type DossierOption = { id: string; label: string };

// The dossier page's header used to show one course title as if it were
// the learner's single identity, even though a contact can have several
// dossiers (client feedback — see the S4 UX audit). When there's more than
// one, this renders as an actual switcher instead of flat text, so the
// page itself signals "there are others" rather than implying singularity.
export function DossierSwitcher({ dossiers, currentId }: { dossiers: DossierOption[]; currentId: string }) {
  const router = useRouter();
  const current = dossiers.find((d) => d.id === currentId);

  if (dossiers.length <= 1) {
    return <span className="text-[13px] text-ink font-medium">{current?.label ?? ""}</span>;
  }

  return (
    <select
      value={currentId}
      onChange={(e) => router.push(`/dossiers/${e.target.value}`)}
      className="bg-transparent border border-line rounded-md px-2 py-1 text-[12.5px] text-ink font-medium outline-none focus:border-seal max-w-[260px]"
    >
      {dossiers.map((d) => (
        <option key={d.id} value={d.id}>
          {d.label}
        </option>
      ))}
    </select>
  );
}
