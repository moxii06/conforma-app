import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ActivationForm } from "@/components/ActivationForm";
import { ROLE_LABELS } from "@/lib/tenant";

export default async function ActivationPage({ params }: { params: { token: string } }) {
  const user = await prisma.user.findUnique({
    where: { activationToken: params.token },
    include: { organization: true },
  });
  if (!user) notFound();

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
            <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
          </div>
          <div className="font-display text-lg text-ink">{user.organization.name}</div>
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          {user.status !== "invited" ? (
            <div className="text-center py-4">
              <div className="text-[14px] text-ink font-medium mb-1.5">Ce lien d&apos;activation a déjà été utilisé.</div>
              <div className="text-[12.5px] text-slate">Rendez-vous sur la page de connexion pour accéder à votre espace.</div>
            </div>
          ) : (
            <>
              <div className="text-[13.5px] font-semibold text-ink mb-1">
                Bienvenue, {user.name}
              </div>
              <div className="text-[12.5px] text-slate mb-4">
                Définissez votre mot de passe pour activer votre accès ({ROLE_LABELS[user.role]}) à l&apos;espace {user.organization.name}.
              </div>
              <ActivationForm token={user.activationToken!} email={user.email} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
