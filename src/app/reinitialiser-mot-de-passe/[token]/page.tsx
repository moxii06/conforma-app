import { prisma } from "@/lib/prisma";
import { ShieldCheck } from "lucide-react";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({ params }: { params: { token: string } }) {
  const user = await prisma.user.findUnique({
    where: { passwordResetToken: params.token },
    include: { organization: true },
  });
  const valid = Boolean(user && user.passwordResetTokenExpiresAt && user.passwordResetTokenExpiresAt > new Date());

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
            <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
          </div>
          <div className="font-display text-lg text-ink">{user?.organization.name ?? "Conforma"}</div>
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          {!valid || !user ? (
            <div className="text-center py-4">
              <div className="text-[14px] text-ink font-medium mb-1.5">Ce lien a expiré ou n&apos;est plus valide.</div>
              <div className="text-[12.5px] text-slate">Demandez un nouveau lien depuis la page de connexion.</div>
            </div>
          ) : (
            <>
              <div className="text-[13.5px] font-semibold text-ink mb-1">Réinitialiser votre mot de passe</div>
              <div className="text-[12.5px] text-slate mb-4">Choisissez un nouveau mot de passe pour {user.email}.</div>
              <ResetPasswordForm token={params.token} email={user.email} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
