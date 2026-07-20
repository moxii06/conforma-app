import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, PERMISSIONS, FEATURE_LABELS, ROLE_LABELS } from "@/lib/tenant";
import { InviteMemberForm } from "@/components/InviteMemberForm";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

const ACCESS_TONE = { full: "good", limited: "warn", none: "neutral" } as const;
const ACCESS_LABEL = { full: "Complet", limited: "Limité", none: "Aucun" } as const;

export default async function TeamPage() {
  const session = await requireSessionContext();
  if (can(session.role, "team") !== "full") redirect("/dashboard");

  const members = await prisma.user.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "asc" },
  });

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
