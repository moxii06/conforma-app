import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BrandedLogo } from "@/components/BrandedLogo";
import { ActivationForm } from "@/components/ActivationForm";
import { ROLE_LABELS } from "@/lib/tenant";

export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const params = await props.params;
  const user = await prisma.user.findUnique({
    where: { activationToken: params.token },
    select: { organization: { select: { name: true } } },
  });
  return { title: user ? `Activation de compte — ${user.organization.name}` : "Jalon" };
}

export default async function ActivationPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const user = await prisma.user.findUnique({
    where: { activationToken: params.token },
    include: { organization: true },
  });
  if (!user) notFound();

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <BrandedLogo name={user.organization.name} logoUrl={user.organization.logoUrl} brandColor={user.organization.brandColor} size={28} />

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
