import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/tenant";

export const SUBCONTRACTOR_TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};

export type OrgChartGroup = { key: string; label: string; people: { id: string; name: string }[] };
export type OrgChartGroups = { roleGroups: OrgChartGroup[]; typeGroups: OrgChartGroup[] };

// Shared between the live "Organigramme" tab and the snapshot archive
// route, so a saved snapshot's shape always matches what the live view
// would have rendered at that moment.
export function buildOrgChartGroups(
  members: { id: string; name: string; role: Role }[],
  subcontractors: { id: string; name: string; type: string }[]
): OrgChartGroups {
  const roleGroups = Object.values(Role)
    .filter((r) => r !== Role.LEARNER)
    .map((role) => ({
      key: role,
      label: ROLE_LABELS[role],
      people: members.filter((m) => m.role === role).map((m) => ({ id: m.id, name: m.name })),
    }))
    .filter((g) => g.people.length > 0);

  const typeGroups = Object.entries(SUBCONTRACTOR_TYPE_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      people: subcontractors.filter((s) => s.type === key).map((s) => ({ id: s.id, name: s.name })),
    }))
    .filter((g) => g.people.length > 0);

  return { roleGroups, typeGroups };
}
