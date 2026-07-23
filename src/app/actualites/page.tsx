import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { NewsletterForm } from "@/components/NewsletterForm";

export const metadata: Metadata = {
  title: "Actualités — Conforma",
  description: "Qualiopi, RGPD, réglementation des organismes de formation : nos analyses et prises de position.",
};

const CATEGORY_LABELS: Record<string, string> = {
  qualiopi: "Qualiopi",
  rgpd: "RGPD",
  reglementation: "Réglementation",
  produit: "Produit",
};

export default async function ActualitesPage() {
  const articles = await prisma.newsArticle.findMany({ orderBy: { publishedAt: "desc" } });

  return (
    <div className="bg-paper min-h-screen">
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <ShieldCheck size={16} className="text-ink" strokeWidth={2.4} />
            </div>
            <span className="font-display text-lg text-ink tracking-wide">Conforma</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Link href="/essai" className="text-ink text-[13.5px] font-medium rounded-md px-4 py-2 border border-line hover:border-ink-soft">
              M&apos;inscrire
            </Link>
            <Link href="/login" className="bg-ink text-white text-[13.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft">
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="text-[12px] font-semibold text-seal-dark uppercase tracking-wide mb-2">Actualités</div>
        <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.1] text-ink mb-4 text-balance">
          Qualiopi, RGPD, réglementation : nos analyses
        </h1>
        <p className="text-[15px] text-slate leading-relaxed max-w-xl mx-auto">
          Ce qui change pour les organismes de formation, décrypté sans jargon.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-12">
        <div className="bg-white border border-line rounded-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">Recevoir nos analyses par email</div>
            <div className="text-[12px] text-slate">Un email occasionnel, pas de spam.</div>
          </div>
          <NewsletterForm />
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20 flex flex-col gap-4">
        {articles.map((a) => (
          <Link
            key={a.id}
            href={`/actualites/${a.slug}`}
            className="bg-white border border-line rounded-card p-5 hover:border-ink-soft transition-colors"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-[11px] font-semibold text-seal-dark uppercase tracking-wide">
                {CATEGORY_LABELS[a.category] ?? a.category}
              </span>
              <span className="text-[11px] text-slate">
                {new Date(a.publishedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="text-[16px] font-semibold text-ink mb-1.5">{a.title}</div>
            <div className="text-[13px] text-slate leading-relaxed">{a.excerpt}</div>
          </Link>
        ))}
        {articles.length === 0 && <div className="text-[13px] text-slate text-center">Aucun article pour le moment.</div>}
      </section>

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
