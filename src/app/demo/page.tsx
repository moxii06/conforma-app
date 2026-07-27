import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, Milestone, Check } from "lucide-react";
import { DemoRequestForm } from "@/components/DemoRequestForm";

export const metadata: Metadata = {
  title: "Réserver une démonstration — Jalon",
  description:
    "Voyez Jalon appliqué à votre organisme de formation : CRM, planning, facturation et preuves Qualiopi/RGPD. Démonstration personnalisée, sans engagement.",
};

const POINTS = [
  "Une démonstration adaptée à votre activité, pas une visite générique",
  "Vos questions Qualiopi / RGPD / BPF traitées concrètement",
  "Une estimation claire de la mise en route pour votre organisme",
];

export default function DemoPage() {
  return (
    <div className="bg-paper min-h-screen">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <Milestone size={16} className="text-ink" strokeWidth={2.4} />
            </div>
            <span className="font-display text-lg text-ink tracking-wide">Jalon</span>
          </Link>
          <Link href="/essai" className="bg-ink text-white text-[13.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft">
            Essai gratuit
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-[1fr_400px] gap-10">
        <div>
          <div className="inline-flex items-center gap-2 text-[12px] font-medium text-seal-dark bg-[#F0E7D4] border border-[#D9C79E] rounded-full px-3 py-1 mb-5">
            Démonstration personnalisée · sans engagement
          </div>
          <h1 className="font-display text-[32px] sm:text-[38px] leading-[1.1] text-ink mb-4 text-balance">
            Voyez Jalon appliqué à votre organisme
          </h1>
          <p className="text-[15px] text-slate leading-relaxed mb-8">
            En 30 minutes, on parcourt ensemble votre cas concret : votre catalogue, vos sessions, vos preuves
            Qualiopi et votre suivi RGPD. Vous repartez avec une vision claire de ce que Jalon change pour vous.
          </p>
          <ul className="flex flex-col gap-3 mb-8">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                <Check size={16} className="text-sage mt-0.5 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <div className="text-[12.5px] text-slate border-t border-line pt-5">
            Vous préférez tester par vous-même ?{" "}
            <Link href="/essai" className="text-ink font-medium underline decoration-line hover:decoration-ink">
              Commencez l&apos;essai gratuit
            </Link>{" "}
            (14 jours, sans carte bancaire).
          </div>
        </div>

        <div>
          <DemoRequestForm />
        </div>
      </div>

      <footer className="border-t border-line">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
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
