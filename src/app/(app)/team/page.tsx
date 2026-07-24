import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, PERMISSIONS, FEATURE_LABELS, ROLE_LABELS } from "@/lib/tenant";
import { InviteMemberForm } from "@/components/InviteMemberForm";
import { ReferentHandicapSelect } from "@/components/ReferentHandicapSelect";
import { SubcontractorForm } from "@/components/SubcontractorForm";
import { SubcontractorStatusSelect } from "@/components/SubcontractorStatusSelect";
import { MemberRoleSelect } from "@/components/MemberRoleSelect";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { Tabs } from "@/components/Tabs";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const ACCESS_TONE = { full: "good", limited: "warn", none: "neutral" } as const;
const ACCESS_LABEL = { full: "Complet", limited: "Limité", none: "Aucun" } as const;
const SUBCONTRACTOR_TYPE_LABELS: Record<string, string> = {
  formateur_externe: "Formateur externe",
  sous_traitant_pedagogique: "Sous-traitant pédagogique",
  prestataire_technique: "Prestataire technique",
  autre: "Autre",
};
const SUBCONTRACTOR_STATUS_LABELS: Record<string, string> = { active: "Actif", expired: "Expiré", terminated: "Terminé" };

// Client feedback: a formateur specifically needs contrat/CV/diplôme/NDA
// tracked — other subcontractor types just need a contrat. Drives the
// tracking table's "pièces manquantes" column below.
const REQUIRED_DOCS_BY_TYPE: Record<string, string[]> = {
  formateur_externe: ["subcontractor_contract", "cv", "diploma", "nda"],
  sous_traitant_pedagogique: ["subcontractor_contract"],
  prestataire_technique: ["subcontractor_contract"],
  autre: ["subcontractor_contract"],
};

const TABS = [
  { key: "membres", label: "Membres" },
  { key: "prestataires", label: "Sous-traitants & intervenants" },
  { key: "permissions", label: "Permissions" },
];

function isExpiringSoon(date: Date | null) {
  if (!date) return false;
  return date.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000;
}

export default async function TeamPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "team") !== "full") redirect("/dashboard");
  const activeTab = searchParams.tab ?? TABS[0].key;

  const [allMembers, organization, subcontractors] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: session.organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    prisma.subcontractor.findMany({
      where: { organizationId: session.organizationId },
      include: { documents: true, linkedUser: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Client feedback: no need to itemize every single learner's access here —
  // this page is about staff and roles, and a learner cohort can run into
  // the hundreds. Learners still count toward the total, just not as rows.
  const members = allMembers.filter((m) => m.role !== Role.LEARNER);
  const learnerCount = allMembers.length - members.length;

  return (
    <>
      <PageHeader title="Équipe & rôles" subtitle="Membres de l'organisation et matrice de permissions" />
      <Tabs basePath="/team" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-6">
        {activeTab === "prestataires" ? (
          <SubcontractorsTab subcontractors={subcontractors} />
        ) : activeTab === "permissions" ? (
          <PermissionsTab />
        ) : (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-3.5">Membres ({members.length})</div>
            {learnerCount > 0 && (
              <div className="text-[11.5px] text-slate mb-3">
                {learnerCount} compte{learnerCount > 1 ? "s" : ""} apprenant{learnerCount > 1 ? "s" : ""} actif
                {learnerCount > 1 ? "s" : ""} (non listés ici — voir Dossiers apprenants).
              </div>
            )}
            <div className="flex items-center text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
              <div className="flex-[1.5]">Nom</div>
              <div className="flex-[2]">Email</div>
              <div className="flex-1">Rôle</div>
              <div className="flex-[0.6]">Statut</div>
            </div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
                <div className="flex-[1.5]">
                  <Link href={`/team/members/${m.id}`} className="font-medium text-ink underline decoration-line hover:decoration-ink">
                    {m.name}
                  </Link>
                </div>
                <div className="flex-[2] text-slate">{m.email}</div>
                <div className="flex-1">
                  {m.role === Role.ADMIN_OF ? ROLE_LABELS[m.role] : <MemberRoleSelect memberId={m.id} role={m.role} />}
                </div>
                <div className="flex-[0.6]">
                  <Pill tone={m.status === "active" ? "good" : "warn"}>{m.status === "active" ? "Actif" : "Invité"}</Pill>
                </div>
              </div>
            ))}

            <div className="mt-5 pt-5 border-t border-line">
              <div className="text-[12.5px] font-semibold text-ink mb-3">Inviter un membre</div>
              <InviteMemberForm />
              <div className="text-[11.5px] text-slate mt-2.5">
                L&apos;envoi d&apos;email d&apos;invitation n&apos;est pas encore branché (spec §3 prévoit Brevo) — le
                membre est créé avec le statut « invité » et devra recevoir son accès par un autre biais pour l&apos;instant.
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-line">
              <div className="text-[12.5px] font-semibold text-ink mb-1">Référent handicap</div>
              <div className="text-[11.5px] text-slate mb-3">
                Seuls les administrateurs et cette personne peuvent accéder aux demandes d&apos;aménagement (données
                sensibles au sens RGPD).
              </div>
              <ReferentHandicapSelect
                members={members.filter((m) => m.role !== Role.LEARNER).map((m) => ({ id: m.id, name: m.name }))}
                currentUserId={organization.referentHandicapUserId}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type SubcontractorRow = {
  id: string;
  name: string;
  type: string;
  isIndividual: boolean;
  legalForm: string | null;
  siret: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  qualifications: string | null;
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  qualificationExpiryDate: Date | null;
  status: string;
  documents: { id: string; title: string; category: string; fileUrl: string | null }[];
  linkedUser: { id: string; name: string; status: string } | null;
};

function SubcontractorsTab({ subcontractors }: { subcontractors: SubcontractorRow[] }) {
  return (
    <>
      {subcontractors.length > 0 && (
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Tableau de suivi</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-slate font-semibold uppercase tracking-wide text-[11px] border-b border-line">
                  <th className="pb-2 pr-3">Nom</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Contrat jusqu&apos;au</th>
                  <th className="pb-2 pr-3">Pièces manquantes</th>
                  <th className="pb-2 pr-3">Compte plateforme</th>
                  <th className="pb-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {subcontractors.map((s) => {
                  const required = REQUIRED_DOCS_BY_TYPE[s.type] ?? ["subcontractor_contract"];
                  const missing = required.filter((cat) => !s.documents.some((d) => d.category === cat));
                  const contractExpiring = isExpiringSoon(s.contractEndDate);
                  return (
                    <tr key={s.id} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3 text-ink font-medium">
                        <Link href={`/team/subcontractors/${s.id}`} className="underline decoration-line hover:decoration-ink">
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate">{SUBCONTRACTOR_TYPE_LABELS[s.type] ?? s.type}</td>
                      <td className={`py-2 pr-3 ${contractExpiring ? "text-rust font-medium" : "text-slate"}`}>
                        {s.contractEndDate ? format(s.contractEndDate, "d MMM yyyy", { locale: fr }) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {missing.length === 0 ? (
                          <Pill tone="good">Complet</Pill>
                        ) : (
                          <span className="text-rust">{missing.map((c) => CATEGORY_LABELS[c] ?? c).join(", ")}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate">
                        {s.linkedUser ? (s.linkedUser.status === "active" ? "Actif" : "Invité") : "—"}
                      </td>
                      <td className="py-2">
                        <Pill tone={s.status === "active" ? "good" : s.status === "expired" ? "warn" : "neutral"}>
                          {SUBCONTRACTOR_STATUS_LABELS[s.status] ?? s.status}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-card p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[13.5px] font-semibold text-ink">Sous-traitants & intervenants ({subcontractors.length})</div>
          <SubcontractorForm />
        </div>
        <div className="text-[11.5px] text-slate mb-3.5">
          Formateurs externes et prestataires. Un formateur externe peut être invité sur la plateforme pour devenir
          assignable à une session, comme n&apos;importe quel formateur interne.
        </div>
        {subcontractors.map((s) => (
          <div key={s.id} className="py-2.5 border-t border-line first:border-t-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/team/subcontractors/${s.id}`} className="text-[13px] text-ink font-medium underline decoration-line hover:decoration-ink">
                {s.name}
              </Link>
              <span className="text-[11.5px] text-slate ml-1.5">
                ({SUBCONTRACTOR_TYPE_LABELS[s.type] ?? s.type}
                {s.isIndividual ? " — entreprise individuelle" : s.legalForm ? ` — ${s.legalForm}` : ""})
              </span>
            </div>
            <SubcontractorStatusSelect subcontractorId={s.id} status={s.status} />
          </div>
        ))}
        {subcontractors.length === 0 && <div className="text-[12.5px] text-slate">Aucun sous-traitant enregistré.</div>}
      </div>
    </>
  );
}

async function PermissionsTab() {
  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Matrice de permissions</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className="text-left text-slate font-semibold uppercase tracking-wide text-[11px] pb-2 border-b border-line pr-3">
                Fonctionnalité
              </th>
              {Object.values(Role).map((r) => (
                <th
                  key={r}
                  className="text-left text-slate font-semibold uppercase tracking-wide text-[11px] pb-2 border-b border-line px-2 whitespace-nowrap"
                >
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(PERMISSIONS).map(([feature, roles]) => (
              <tr key={feature} className="border-b border-line last:border-b-0">
                <td className="py-2 pr-3 text-ink font-medium">{FEATURE_LABELS[feature] ?? feature}</td>
                {Object.values(Role).map((r) => (
                  <td key={r} className="py-2 px-2">
                    <Pill tone={ACCESS_TONE[roles[r]]}>{ACCESS_LABEL[roles[r]]}</Pill>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
