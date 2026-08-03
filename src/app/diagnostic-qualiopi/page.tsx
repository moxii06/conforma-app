import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, Milestone } from "lucide-react";
import { DiagnosticQualiopi } from "@/components/DiagnosticQualiopi";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Diagnostic Qualiopi gratuit — êtes-vous prêt pour votre audit ? | Jalon",
  description:
    "Évaluez en 3 minutes votre préparation aux 7 critères du Référentiel National Qualité. Score par critère, points à renforcer, gratuit et sans engagement.",
};

export default function DiagnosticQualiopiPage() {
  return (
    <div className="bg-paper min-h-screen">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <Milestone size={16} className="text-ink" strokeWidth={2.4} />
            </div>
            <span className="font-display text-lg text-ink tracking-wide">Jalon</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" href="/essai">
              Essai gratuit
            </Button>
            <Button href="/login">Se connecter</Button>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-14 pb-8 text-center">
        <div className="inline-flex items-center gap-2 text-[12px] font-medium text-seal-dark bg-[#EDDFC6] border border-[#dccba8] rounded-full px-3 py-1 mb-5">
          Gratuit · 3 minutes · sans engagement
        </div>
        <h1 className="font-display text-[34px] sm:text-[42px] leading-[1.1] text-ink mb-4 text-balance">
          Êtes-vous prêt pour votre audit Qualiopi ?
        </h1>
        <p className="text-[15px] text-slate leading-relaxed max-w-xl mx-auto">
          Répondez à 12 questions sur les 7 critères du Référentiel National Qualité. Vous obtenez un score de
          préparation, un bilan par critère et vos points à renforcer en priorité.
        </p>
      </section>

      <section className="max-w-2xl mx-auto px-6 pb-20">
        <DiagnosticQualiopi />
      </section>

      <footer className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate">
            <ShieldCheck size={14} />
            <span>Jalon — le logiciel de conformité des organismes de formation</span>
          </div>
          <Link href="/" className="text-[13px] font-medium text-ink underline decoration-line hover:decoration-ink">
            Découvrir Jalon
          </Link>
        </div>
      </footer>
    </div>
  );
}
