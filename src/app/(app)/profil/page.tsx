import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, ROLE_LABELS } from "@/lib/tenant";
import { SignatureEditor } from "@/components/SignatureEditor";

// Every role gets one — no permission gate beyond being logged in, unlike
// most pages here which are feature-gated per PERMISSIONS.
export default async function ProfilePage() {
  const session = await requireSessionContext();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Informations personnelles et signature de mail" />
      <div className="p-8 flex flex-col gap-5 max-w-2xl">
        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13px] font-semibold text-ink">{user.name}</div>
          <div className="text-[12.5px] text-slate mt-0.5">{user.email}</div>
          <div className="text-[12px] text-slate mt-0.5">{ROLE_LABELS[user.role]}</div>
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[13.5px] font-semibold text-ink mb-1">Signature de mail</div>
          <div className="text-[11.5px] text-slate mb-3">
            Ajoutée automatiquement à la fin des messages composés (envoi de documents, communications avec un
            apprenant ou un prospect) — la même que celle que vous utilisez normalement depuis votre propre boîte
            mail.
          </div>
          <SignatureEditor initialSignature={user.emailSignature ?? `Cordialement,<br>${user.name}`} />
        </div>
      </div>
    </>
  );
}
