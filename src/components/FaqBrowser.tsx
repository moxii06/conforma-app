"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Search, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { FAQ_CATEGORIES, FAQ_STARTER_STEPS } from "@/lib/faqContent";

// Accent- and case-insensitive: French help content is full of accented
// words a user won't bother typing ("reclamation", "echeance"), and a search
// box that misses those reads as "the answer isn't here" rather than "you
// typed it wrong".
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function FaqBrowser({ visibleKeys, showStarter }: { visibleKeys: string[]; showStarter: boolean }) {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const visible = useMemo(
    () => FAQ_CATEGORIES.filter((c) => visibleKeys.includes(c.key)),
    [visibleKeys],
  );

  // Matching on the answer body too, not just the question — people search
  // for the thing they can see on screen ("convocation", "whsec_"), which is
  // usually a word from the steps rather than from the question title.
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return visible;
    return visible
      .map((category) => ({
        ...category,
        guides: category.guides.filter((g) =>
          normalize(`${g.question} ${g.steps.join(" ")}`).includes(q),
        ),
      }))
      .filter((category) => category.guides.length > 0);
  }, [visible, query]);

  const searching = query.trim().length > 0;
  const totalMatches = results.reduce((n, c) => n + c.guides.length, 0);

  // Highlights the section currently under the reader in the sticky summary.
  // Disabled while searching — the list is being rewritten under the
  // observer and the highlight would flicker between sections that are about
  // to disappear.
  useEffect(() => {
    if (searching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visibleEntry) setActiveKey(visibleEntry.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const el of Object.values(sectionRefs.current)) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [searching, results]);

  return (
    <div className="p-8 flex gap-8 items-start">
      {/* Sticky summary: the reader who lands here from a deep link
          (/faq#facturation) can see the rest of the map without scrolling
          back up. Hidden on narrow screens where it would eat the content. */}
      <nav className={`${visible.length > 1 ? "hidden lg:flex" : "hidden"} flex-col gap-0.5 sticky top-8 w-52 shrink-0`}>
        <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">Sommaire</div>
        {visible.map((c) => (
          <a
            key={c.key}
            href={`#${c.key}`}
            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
              activeKey === c.key && !searching ? "bg-linen text-ink font-medium" : "text-slate hover:text-ink hover:bg-linen"
            }`}
          >
            <span className="truncate">{c.label}</span>
            <span className="text-[10.5px] text-ash tabular-nums shrink-0">{c.guides.length}</span>
          </a>
        ))}
      </nav>

      <div className="flex-1 min-w-0 max-w-2xl flex flex-col gap-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une question, un mot-clé…"
            aria-label="Rechercher dans l'aide"
            className="w-full bg-white border border-line rounded-md pl-9 pr-3 py-2.5 text-[13px] text-ink outline-none focus:border-seal placeholder:text-ash"
          />
        </div>

        {searching && (
          <div className="text-[12px] text-slate">
            {totalMatches === 0
              ? "Aucun guide ne correspond."
              : `${totalMatches} guide${totalMatches > 1 ? "s" : ""} trouvé${totalMatches > 1 ? "s" : ""}.`}
          </div>
        )}

        {/* Premiers pas: deliberately above the categories and styled apart —
            it's a path through the app, not another topic in the list. Hidden
            during a search, where the reader has a specific question and this
            would just be noise between them and their answer. */}
        {!searching && showStarter && (
          <div className="bg-linen border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-1">Premiers pas</div>
            <div className="text-[12px] text-slate mb-3.5">
              L&apos;ordre dans lequel configurer Jalon pour que le reste s&apos;enchaîne sans blocage.
            </div>
            <ol className="flex flex-col gap-2.5">
              {FAQ_STARTER_STEPS.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-white border border-line text-[11px] text-ink font-medium flex items-center justify-center shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="text-[12.5px] text-ink font-medium">{step.title}</div>
                    <div className="text-[12px] text-slate">
                      {step.detail}{" "}
                      {step.anchor && (
                        <a href={`#${step.anchor}`} className="text-ink underline decoration-line hover:decoration-ink">
                          Voir le guide
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {results.map((category) => {
          const Icon = category.icon;
          return (
            <section
              key={category.key}
              id={category.key}
              ref={(el) => {
                sectionRefs.current[category.key] = el;
              }}
              className="bg-white border border-line rounded-card p-5 scroll-mt-8"
            >
              <div className="flex items-start gap-2.5 mb-3.5">
                <div className="w-7 h-7 rounded-md bg-pebble flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-ink" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{category.label}</span>
                    <span className="text-[11px] text-slate tabular-nums">
                      {category.guides.length} guide{category.guides.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-[12px] text-slate">{category.description}</div>
                </div>
              </div>
              <div className="flex flex-col">
                {category.guides.map((guide) => (
                  <details
                    key={guide.question}
                    // Forced open while searching: a hit the reader can't see
                    // without a second click looks like no hit at all.
                    open={searching || undefined}
                    className="border-t border-line py-2.5 first:border-t-0 first:pt-0"
                  >
                    <summary className="text-[12.5px] text-ink font-medium cursor-pointer marker:text-slate">
                      {guide.question}
                    </summary>
                    <ol className="mt-2 pl-4 flex flex-col gap-1.5 list-decimal marker:text-ash">
                      {guide.steps.map((step, j) => (
                        <li key={j} className="text-[12px] text-slate leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </section>
          );
        })}

        {/* Support CTA at the bottom only — every help centre studied puts it
            after the self-service attempt, never above it. */}
        <div className="bg-white border border-line rounded-card p-5 flex items-start gap-3">
          <div className="w-7 h-7 rounded-md bg-pebble flex items-center justify-center shrink-0">
            <LifeBuoy size={15} className="text-ink" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-ink mb-0.5">Vous n&apos;avez pas trouvé ?</div>
            <div className="text-[12px] text-slate">
              Posez votre question depuis{" "}
              <Link href="/support" className="text-ink underline decoration-line hover:decoration-ink">
                Aide &amp; demandes
              </Link>
              {" "}— une réponse vous sera adressée par email.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
