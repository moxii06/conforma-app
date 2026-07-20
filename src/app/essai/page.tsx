import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignupForm } from "@/components/SignupForm";
import { ShieldCheck, Check } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Créer votre compte — Conforma",
};

const PLAN_DETAILS: Record<string, { name: string; price: string; features: string[] }> = {
  solo: { name: "Solo", price: "39 €/mois", features: ["1 utilisateur", "Jusqu'à 15 apprenants actifs / mois", "Toolkit documents inclus"] },
  team: { name: "Team", price: "89 €/mois", features: ["5 utilisateurs", "Apprenants illimités", "Portails apprenant / formateur", "E-learning de base"] },
  growth: { name: "Growth", price: "149 €/mois", features: ["Utilisateurs illimités", "Module RGPD / DPIA complet", "Futures intégrations OPCO"] },
};

export default async function EssaiPage({ searchParams }: { searchParams: { plan?: string } }) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  const plan = searchParams.plan && PLAN_DETAILS[searchParams.plan] ? searchParams.plan : "team";
  const details = PLAN_DETAILS[plan];

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
            </div>
            <span className="font-display text-lg text-ink tracking-wide">Conforma</span>
          </Link>
          <Link href="/login" className="text-[13.5px] text-slate hover:text-ink">
            Déjà client ? Se connecter
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-10">
        <div>
          <h1 className="font-display text-[30px] text-ink mb-2">Créez votre compte</h1>
          <p className="text-[14px] text-slate mb-8">
            14 jours d&apos;essai gratuit, sans carte bancaire. Votre espace est prêt en moins d&apos;une minute.
          </p>
          <SignupForm initialPlan={plan} />
        </div>

        <div className="bg-ink text-white rounded-card p-6 h-fit">
          <div className="text-[11.5px] font-semibold text-white/60 uppercase tracking-wide mb-1">Offre sélectionnée</div>
          <div className="font-display text-[22px] mb-1">{details.name}</div>
          <div className="text-[13px] text-white/70 mb-5">{details.price}, après l&apos;essai</div>
          <ul className="flex flex-col gap-2.5">
            {details.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[12.5px] text-white/85">
                <Check size={14} className="text-seal mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-5 border-t border-white/15 text-[11.5px] text-white/60">
            Modifiable à tout moment depuis votre espace. Aucun engagement pendant l&apos;essai.
          </div>
        </div>
      </div>
    </div>
  );
}
