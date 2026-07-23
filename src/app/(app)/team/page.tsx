import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, PERMISSIONS, FEATURE_LABELS, ROLE_LABELS } from "@/lib/tenant";
import { InviteMemberForm } from "@/components/InviteMemberForm";
import { ReferentHandicapSelect } from "@/components/ReferentHandicapSelect";
import { SubcontractorForm } from "@/components/SubcontractorForm";
import { SubcontractorStatusSelect } from "@/components/SubcontractorStatusSelect";
import { AddSubcontractorDocumentForm } from "@/components/AddSubcontractorDocumentForm";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
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

// Flags a date within 30 days (including already-past) as needing
// attention — same threshold as the dashboard's expiry task, kept in sync
// manually since this is presentational highlighting, not the task itself.
function isExpiringSoon(date: Date | null) {
  if (!date) return false;
  return date.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000;
}

export default async function TeamPage() {
  const session = await requireSessionContext();
  if (can(session.role, "team") !== "full") redirect("/dashboard");

  const [members, organization, subcontractors] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: session.organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    prisma.subcontractor.findMany({
      where: { organizationId: session.organizationId },
      include: { documents: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader title="Équipe & rôles" subtitle="Membres de l'organisation et matrice de permissions" />
      <div className="p-8 flex flex-col gap-6">
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-3.5">Membres ({members.length})</div>
          <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
            <div className="flex-[1.5]">Nom</div>
            <div className="flex-[2]">Email</div>
            <div className="flex-1">Rôle</div>
            <div className="flex-[0.6]">Statut</div>
          </div>
          {members.map((m) => (
            <div key={m.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
              <div className="flex-[1.5]">{m.name}</div>
              <div className="flex-[2] text-slate">{m.email}</div>
              <div className="flex-1">{ROLE_LABELS[m.role]}</div>
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

        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[13.5px] font-semibold text-ink">Sous-traitants & intervenants ({subcontractors.length})</div>
            <SubcontractorForm />
          </div>
          <div className="text-[11.5px] text-slate mb-3.5">
            Formateurs externes et prestataires — distincts des membres de l&apos;équipe, sans accès à Conforma.
          </div>
          {subcontractors.map((s) => {
            const contractExpiring = isExpiringSoon(s.contractEndDate);
            const qualificationExpiring = isExpiringSoon(s.qualificationExpiryDate);
            return (
              <div key={s.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[13px] text-ink font-medium">{s.name}</span>
                    <span className="text-[11.5px] text-slate ml-1.5">({SUBCONTRACTOR_TYPE_LABELS[s.type] ?? s.type})</span>
                  </div>
                  <SubcontractorStatusSelect subcontractorId={s.id} status={s.status} />
                </div>
                {s.qualifications && <div className="text-[12px] text-ink">{s.qualifications}</div>}
                <div className="text-[11.5px] flex items-center gap-2 flex-wrap">
                  {s.contactEmail && <span className="text-slate">{s.contactEmail}</span>}
                  {s.contractEndDate && (
                    <span className={contractExpiring ? "text-rust font-medium" : "text-slate"}>
                      Contrat jusqu&apos;au {format(s.contractEndDate, "d MMM yyyy", { locale: fr })}
                    </span>
                  )}
                  {s.qualificationExpiryDate && (
                    <span className={qualificationExpiring ? "text-rust font-medium" : "text-slate"}>
                      Qualification valable jusqu&apos;au {format(s.qualificationExpiryDate, "d MMM yyyy", { locale: fr })}
                    </span>
                  )}
                </div>
                {s.documents.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {s.documents.map((doc) => (
                      <a key={doc.id} href={doc.fileUrl ?? "#"} target="_blank" rel="noreferrer" className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink">
                        {doc.title}
                      </a>
                    ))}
                  </div>
                )}
                <AddSubcontractorDocumentForm subcontractorId={s.id} />
              </div>
            );
          })}
          {subcontractors.length === 0 && <div className="text-[12.5px] text-slate">Aucun sous-traitant enregistré.</div>}
        </div>

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
      </div>
    </>
  );
}
