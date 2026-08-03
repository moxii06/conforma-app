import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui";

export default async function NotFound() {
  const session = await getSessionContext();
  const href = session ? (session.role === Role.LEARNER ? "/mon-espace" : "/dashboard") : "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-mist p-4">
      <div className="bg-white border border-line rounded-card p-8 max-w-sm text-center">
        <div className="font-display text-[28px] text-ink mb-2">Page introuvable</div>
        <p className="text-[13px] text-slate leading-relaxed mb-5">
          Cette page n&apos;existe pas, ou a été déplacée.
        </p>
        <Button href={href}>Retour à l&apos;accueil</Button>
      </div>
    </div>
  );
}
