import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck,
  Users,
  Calendar,
  FileText,
  ScrollText,
  Receipt,
  GraduationCap,
  User,
  Check,
  ArrowRight,
  FileSpreadsheet,
  Mail,
  FolderOpen,
} from "lucide-react";

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

const REPLACES = [
  { icon: FileSpreadsheet, text: "Le tableur Excel pour suivre vos apprenants et votre BPF" },
  { icon: Mail, text: "Les relances manuelles pour les recueils de besoins, conventions, convocations" },
  { icon: FolderOpen, text: "Le dossier partagé où vous cherchez vos preuves Qualiopi la veille de l'audit" },
];

const STEPS = [
  { n: "01", title: "Un prospect entre dans le CRM", text: "Depuis un formulaire, un email ou saisi à la main — le pipeline commercial suit chaque étape jusqu'à la facturation." },
  { n: "02", title: "La session se planifie toute seule", text: "Convention, convocation, accès e-learning : chaque envoi part d'un clic et se trace automatiquement dans le dossier." },
  { n: "03", title: "Le dossier de conformité se construit en continu", text: "BPF, indicateurs Qualiopi et registre RGPD se remplissent avec ce que vous saisissez déjà pour gérer votre activité." },
];

const FAQ = [
  {
    q: "Combien de temps pour être opérationnel ?",
    a: "Comptez une demi-journée pour importer vos formations et vos contacts, et configurer vos modèles de documents. Aucune installation, aucun serveur à gérer.",
  },
  {
    q: "Mes données sont-elles hébergées en France ?",
    a: "Oui, l'ensemble de vos données (apprenants, dossiers, documents) est hébergé en France, avec un accès chiffré et des sauvegardes automatiques.",
  },
  {
    q: "Puis-je essayer sans engagement ?",
    a: "Oui — 14 jours d'essai gratuit, sans carte bancaire à saisir au départ. Aucun frais de mise en route facturé à part, contrairement à certains éditeurs du secteur. Vous changez ou résiliez votre offre à tout moment.",
  },
  {
    q: "Et si je gère aussi des sous-traitants ou des formateurs externes ?",
    a: "Ils ont leur propre espace : vue calendrier, documents à fournir, sessions assignées — sans accès au reste de votre CRM.",
  },
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
    price: "189",
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
          <nav className="hidden md:flex items-center gap-6 text-[13.5px] text-slate">
            <a href="#fonctionnalites" className="hover:text-ink">Fonctionnalités</a>
            <a href="#conformite" className="hover:text-ink">Conformité</a>
            <a href="#tarifs" className="hover:text-ink">Tarifs</a>
            <Link href="/actualites" className="hover:text-ink">Actualités</Link>
          </nav>
          <div className="flex items-center gap-3 sm:gap-2.5">
            <Link
              href="/login?as=learner"
              className="hidden sm:inline text-slate text-[13px] hover:text-ink underline decoration-line hover:decoration-ink"
            >
              Espace apprenant
            </Link>
            <Link
              href="/login"
              className="text-ink text-[13.5px] font-medium rounded-md px-4 py-2 border border-line hover:border-ink-soft"
            >
              Espace organisme
            </Link>
            <Link
              href="/essai"
              className="bg-ink text-white text-[13.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft"
            >
              Essai gratuit
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-[12px] font-medium text-seal-dark bg-[#F0E7D4] border border-[#D9C79E] rounded-full px-3 py-1 mb-6">
          Hébergement France · Qualiopi · RGPD
        </div>
        <h1 className="font-display text-[40px] sm:text-[52px] leading-[1.08] text-ink mb-5 text-balance">
          Arrêtez de reconstituer votre dossier Qualiopi la veille de l&apos;audit
        </h1>
        <p className="text-[17px] text-slate leading-relaxed max-w-xl mx-auto mb-9">
          Conforma remplace le tableur, la boîte mail et le dossier partagé par un seul outil : CRM, planning,
          facturation et preuves de conformité, tenus à jour par le travail que vous faites déjà — pas en plus.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/essai?plan=team"
            className="w-full sm:w-auto bg-ink text-white text-[14px] font-medium rounded-md px-5 py-2.5 hover:bg-ink-soft inline-flex items-center justify-center gap-1.5"
          >
            Commencer l&apos;essai gratuit
            <ArrowRight size={15} />
          </Link>
          <a
            href="#comment-ca-marche"
            className="w-full sm:w-auto bg-white border border-line text-ink text-[14px] font-medium rounded-md px-5 py-2.5 hover:border-ink-soft"
          >
            Voir comment ça marche
          </a>
        </div>
        <div className="text-[12.5px] text-slate mt-4">14 jours d&apos;essai gratuit — sans carte bancaire.</div>
      </section>

      {/* ---- Replaces ---- */}
      <section className="border-t border-line bg-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-6">
            Un seul outil à la place de
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {REPLACES.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.text} className="flex items-start gap-2.5">
                  <Icon size={16} className="text-slate mt-0.5 shrink-0" />
                  <div className="text-[13px] text-ink leading-snug">{r.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Comment ça marche ---- */}
      <section id="comment-ca-marche" className="max-w-4xl mx-auto px-6 py-16 border-t border-line">
        <div className="text-center mb-12">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Comment ça marche</div>
          <h2 className="font-display text-[28px] text-ink">Trois étapes, un seul endroit où tout se retrouve</h2>
        </div>
        <div className="flex flex-col gap-8">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-5 items-start">
              <div className="font-display text-[26px] text-seal-dark shrink-0 w-12">{s.n}</div>
              <div>
                <div className="text-[15px] font-semibold text-ink mb-1">{s.title}</div>
                <div className="text-[13.5px] text-slate leading-relaxed">{s.text}</div>
              </div>
            </div>
          ))}
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
                <div className="w-8 h-8 rounded-md bg-[#E6E3DA] flex items-center justify-center mb-3.5">
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
          <p className="text-[14.5px] text-white/70 leading-relaxed max-w-xl mx-auto mb-8">
            Une session créée alimente le bilan pédagogique et financier. Un dossier complété fournit les preuves
            attendues par Qualiopi. Une facture enregistrée nourrit le suivi RGPD. Ce que vous saisissez pour votre
            activité devient automatiquement votre dossier de conformité.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
            {[
              "32 indicateurs Qualiopi suivis en continu, pas reconstitués à la dernière minute",
              "BPF généré depuis vos vraies données de session, pas ressaisi à la main",
              "Registre RGPD, DPIA et demandes de droits tenus à jour au fil de l'eau",
            ].map((t) => (
              <div key={t} className="flex items-start gap-2 text-[12.5px] text-white/80">
                <Check size={14} className="text-seal mt-0.5 shrink-0" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="tarifs" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Tarifs</div>
          <h2 className="font-display text-[28px] text-ink mb-2">Trois offres, pensées pour votre croissance</h2>
          <p className="text-[13.5px] text-slate">14 jours d&apos;essai gratuit — sans carte bancaire, sans frais de mise en route.</p>
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
                  plan.featured ? "bg-seal text-ink hover:bg-[#A9884A]" : "bg-ink text-white hover:bg-ink-soft"
                }`}
              >
                Commencer l&apos;essai
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-line">
        <div className="text-center mb-10">
          <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Questions fréquentes</div>
          <h2 className="font-display text-[26px] text-ink">Avant de vous lancer</h2>
        </div>
        <div className="flex flex-col gap-5">
          {FAQ.map((f) => (
            <div key={f.q} className="bg-white border border-line rounded-card p-5">
              <div className="text-[13.5px] font-semibold text-ink mb-1.5">{f.q}</div>
              <div className="text-[12.5px] text-slate leading-relaxed">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="border-t border-line bg-white">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <h2 className="font-display text-[26px] text-ink mb-3 text-balance">Prêt à essayer Conforma ?</h2>
          <p className="text-[13.5px] text-slate mb-7">14 jours d&apos;essai gratuit, sans carte bancaire. Résiliable à tout moment.</p>
          <Link
            href="/essai?plan=team"
            className="inline-flex items-center gap-1.5 bg-ink text-white text-[14px] font-medium rounded-md px-5 py-2.5 hover:bg-ink-soft"
          >
            Commencer l&apos;essai gratuit
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate">
            <ShieldCheck size={14} />
            <span>Conforma — hébergement en France</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/login?as=learner" className="text-[13px] text-slate hover:text-ink underline decoration-line hover:decoration-ink">
              Espace apprenant
            </Link>
            <Link href="/login" className="text-[13px] font-medium text-ink underline decoration-line hover:decoration-ink">
              Espace organisme
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
