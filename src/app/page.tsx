import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, Users, Calendar, FileText, ScrollText, Receipt, GraduationCap, User, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Conforma — Le CRM de conformité pour les organismes de formation",
  description:
    "CRM, planning, facturation et conformité Qualiopi/RGPD réunis dans un seul outil, pensé pour les organismes de formation indépendants et de petite taille.",
};

const FEATURES = [
  { icon: Users, title: "CRM commercial", text: "Pipeline en 5 étapes, du premier contact à la facturation." },
  { icon: Calendar, title: "Planning des sessions", text: "Liste et calendrier, invitations avec visio ou itinéraire générés automatiquement." },
  { icon: FileText, title: "Dossiers apprenants", text: "Parcours, documents, données personnelles et preuves Qualiopi en un seul endroit." },
  { icon: ShieldCheck, title: "Conformité Qualiopi", text: "Les 32 indicateurs suivis en temps réel, checklist d'audit intégrée." },
  { icon: ScrollText, title: "Registre RGPD", text: "Traitements, DPIA, sous-traitants et demandes de droits, sans tableur." },
  { icon: Receipt, title: "Facturation", text: "Devis et factures natifs, prêts pour la réforme de la facturation électronique." },
  { icon: GraduationCap, title: "E-learning", text: "Modules et suivi de progression, alimentent automatiquement vos preuves de conformité." },
  { icon: User, title: "Portails dédiés", text: "Des espaces simplifiés pour vos formateurs et vos apprenants." },
];

const PLANS = [
  {
    slug: "solo",
    name: "Solo",
    price: "39",
    tagline: "Pour démarrer seul",
    features: ["1 utilisateur", "Jusqu'à 15 apprenants actifs / mois", "Toolkit documents inclus"],
    featured: false,
  },
  {
    slug: "team",
    name: "Team",
    price: "89",
    tagline: "Pour une équipe",
    features: ["5 utilisateurs", "Apprenants illimités", "Portails apprenant / formateur", "E-learning de base"],
    featured: true,
  },
  {
    slug: "growth",
    name: "Growth",
    price: "149",
    tagline: "Pour aller plus loin",
    features: ["Utilisateurs illimités", "Module RGPD / DPIA complet", "Futures intégrations OPCO"],
    featured: false,
  },
];

export default function MarketingPage() {
  return (
    <div className="bg-paper min-h-screen">
      {/* ---- Nav ---- */}
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
            </div>
            <span className="font-display text-lg text-ink tracking-wide">Conforma</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-[13.5px] text-slate">
            <a href="#fonctionnalites" className="hover:text-ink">Fonctionnalités</a>
            <a href="#conformite" className="hover:text-ink">Conformité</a>
            <a href="#tarifs" className="hover:text-ink">Tarifs</a>
            <Link href="/actualites" className="hover:text-ink">Actualités</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              href="/essai"
              className="text-ink text-[13.5px] font-medium rounded-md px-4 py-2 border border-line hover:border-ink-soft"
            >
              M&apos;inscrire
            </Link>
            <Link
              href="/login"
              className="bg-ink text-white text-[13.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-[12px] font-medium text-seal-dark bg-[#F7EFDB] border border-[#EBDCB4] rounded-full px-3 py-1 mb-6">
          Hébergement France · Qualiopi · RGPD
        </div>
        <h1 className="font-display text-[40px] sm:text-[52px] leading-[1.08] text-ink mb-5 text-balance">
          Le CRM de conformité pour les organismes de formation
        </h1>
        <p className="text-[17px] text-slate leading-relaxed max-w-xl mx-auto mb-9">
          CRM, planning, facturation et conformité Qualiopi/RGPD réunis dans un seul outil — pensé pour les
          formateurs indépendants et les petits organismes, pas pour les grandes structures.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/essai?plan=team"
            className="bg-ink text-white text-[14px] font-medium rounded-md px-5 py-2.5 hover:bg-ink-soft"
          >
            Commencer l&apos;essai gratuit
          </Link>
          <a
            href="#tarifs"
            className="bg-white border border-line text-ink text-[14px] font-medium rounded-md px-5 py-2.5 hover:border-ink-soft"
          >
            Voir les tarifs
          </a>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section id="fonctionnalites" className="max-w-5xl mx-auto px-6 py-16 border-t border-line">
        <div className="text-center mb-12">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Fonctionnalités</div>
          <h2 className="font-display text-[28px] text-ink">Tout ce qu&apos;un OFP doit gérer, au même endroit</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-white border border-line rounded-card p-5">
                <div className="w-8 h-8 rounded-md bg-[#F1EFE8] flex items-center justify-center mb-3.5">
                  <Icon size={16} className="text-ink" />
                </div>
                <div className="text-[13.5px] font-semibold text-ink mb-1.5">{f.title}</div>
                <div className="text-[12.5px] text-slate leading-relaxed">{f.text}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Conformité ---- */}
      <section id="conformite" className="border-t border-line bg-ink">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-[12px] font-semibold text-seal uppercase tracking-wide mb-2">Notre différence</div>
          <h2 className="font-display text-[28px] text-white mb-4 text-balance">
            La conformité comme sous-produit, pas comme corvée
          </h2>
          <p className="text-[14.5px] text-white/70 leading-relaxed max-w-xl mx-auto">
            Une session créée alimente le bilan pédagogique et financier. Un dossier complété fournit les preuves
            attendues par Qualiopi. Une facture enregistrée nourrit le suivi RGPD. Ce que vous saisissez pour votre
            activité devient automatiquement votre dossier de conformité.
          </p>
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="tarifs" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Tarifs</div>
          <h2 className="font-display text-[28px] text-ink mb-2">Trois offres, pensées pour votre croissance</h2>
          <p className="text-[13.5px] text-slate">14 jours d&apos;essai gratuit — sans carte bancaire.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-card p-6 flex flex-col gap-5 ${
                plan.featured ? "bg-ink text-white ring-2 ring-seal" : "bg-white border border-line text-ink"
              }`}
            >
              <div>
                <div className="font-display text-[19px] mb-1">{plan.name}</div>
                <div className={`text-[12.5px] ${plan.featured ? "text-white/60" : "text-slate"}`}>{plan.tagline}</div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[34px] font-semibold">{plan.price}&nbsp;€</span>
                <span className={`text-[12.5px] ${plan.featured ? "text-white/60" : "text-slate"}`}>/ mois</span>
              </div>
              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12.5px]">
                    <Check size={14} className={`mt-0.5 shrink-0 ${plan.featured ? "text-seal" : "text-sage"}`} />
                    <span className={plan.featured ? "text-white/85" : "text-ink"}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/essai?plan=${plan.slug}`}
                className={`text-center text-[13.5px] font-medium rounded-md px-4 py-2.5 ${
                  plan.featured ? "bg-seal text-ink hover:bg-[#DBAE55]" : "bg-ink text-white hover:bg-ink-soft"
                }`}
              >
                Commencer l&apos;essai
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate">
            <ShieldCheck size={14} />
            <span>Conforma — hébergement en France</span>
          </div>
          <Link href="/login" className="text-[13px] font-medium text-ink underline decoration-line hover:decoration-ink">
            Se connecter à mon espace
          </Link>
        </div>
      </footer>
    </div>
  );
}
