import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck, ArrowLeft, Milestone } from "lucide-react";
import { prisma } from "@/lib/prisma";

const CATEGORY_LABELS: Record<string, string> = {
  qualiopi: "Qualiopi",
  rgpd: "RGPD",
  reglementation: "Réglementation",
  produit: "Produit",
};

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = await prisma.newsArticle.findUnique({ where: { slug: params.slug } });
  if (!article) return {};
  return { title: `${article.title} — Jalon`, description: article.excerpt };
}

function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${j}`} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${j}`}>{part}</span>
    )
  );
}

// Body is authored as plain text with blank-line paragraph breaks,
// **bold** markers, and "- " lines for bullet lists — a lightweight
// convention, not a full markdown renderer, since these articles are
// seeded in code, not user-submitted.
function renderBody(body: string) {
  return body.split("\n\n").map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => l.startsWith("- "))) {
      return (
        <ul key={i} className="list-disc pl-5 text-[14.5px] text-ink leading-relaxed mb-4 flex flex-col gap-1.5">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.slice(2), `${i}-${j}`)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="text-[14.5px] text-ink leading-relaxed mb-4">
        {renderInline(block, `${i}`)}
      </p>
    );
  });
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await prisma.newsArticle.findUnique({ where: { slug: params.slug } });
  if (!article) notFound();

  return (
    <div className="bg-paper min-h-screen">
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <Milestone size={16} className="text-ink" strokeWidth={2.4} />
            </div>
            <span className="font-display text-lg text-ink tracking-wide">Jalon</span>
          </Link>
          <Link href="/login" className="bg-ink text-white text-[13.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft">
            Se connecter
          </Link>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-6 pt-12 pb-20">
        <Link href="/actualites" className="inline-flex items-center gap-1.5 text-[12.5px] text-slate hover:text-ink mb-6">
          <ArrowLeft size={14} />
          Toutes les actualités
        </Link>
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[11px] font-semibold text-seal-dark uppercase tracking-wide">
            {CATEGORY_LABELS[article.category] ?? article.category}
          </span>
          <span className="text-[11px] text-slate">
            {new Date(article.publishedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <h1 className="font-display text-[28px] sm:text-[32px] leading-[1.15] text-ink mb-8 text-balance">
          {article.title}
        </h1>
        <div>{renderBody(article.body)}</div>
      </article>

      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate">
            <ShieldCheck size={14} />
            <span>Jalon — hébergement en France</span>
          </div>
          <Link href="/login" className="text-[13px] font-medium text-ink underline decoration-line hover:decoration-ink">
            Se connecter à mon espace
          </Link>
        </div>
      </footer>
    </div>
  );
}
