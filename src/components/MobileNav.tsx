"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Milestone } from "lucide-react";
import { NAV_GROUPS } from "@/components/navGroups";

/**
 * The navigation for screens narrower than `md`, where the fixed 240 px
 * sidebar left only ~135 px of usable content on a phone — narrower than a
 * business card, and applying to the learner portal too since it shares the
 * (app) layout. Two things depend on this working: signing attendance on a
 * tablet in the training room, and learners opening their course link, which
 * they overwhelmingly do on a phone.
 *
 * Takes the already-permission-filtered feature keys rather than the role, so
 * the desktop sidebar stays the single place that decides what a role sees —
 * this only decides how it's laid out.
 */
export function MobileNav({
  allowedFeatures,
  brandName,
  userLabel,
  roleLabel,
}: {
  allowedFeatures: string[];
  brandName: string;
  userLabel: string;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating is the whole point of opening the drawer, so it closes itself
  // once the route changes rather than leaving the new page behind a panel.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const allowed = new Set(allowedFeatures);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowed.has(i.feature)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      <header className="md:hidden bg-ink text-white flex items-center justify-between px-4 h-14 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center shrink-0">
            <Milestone size={17} className="text-ink" strokeWidth={2.4} />
          </div>
          <span className="font-display text-lg tracking-wide truncate">{brandName}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          // min-h-11 = 44 px, the smallest comfortable touch target.
          className="min-h-11 min-w-11 flex items-center justify-center -mr-2 text-white/90 hover:text-white"
        >
          <Menu size={22} />
        </button>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- Escape is handled above; this is the redundant tap-outside affordance */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />

          <nav className="relative bg-ink text-white w-72 max-w-[85vw] h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 h-14 border-b border-ink-soft shrink-0">
              <span className="font-display text-lg tracking-wide truncate">{brandName}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="min-h-11 min-w-11 flex items-center justify-center -mr-2 text-white/90 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
              {groups.map((group, i) => (
                <div key={group.label ?? "home"} className={i > 0 ? "mt-3 pt-3 border-t border-ink-soft/60" : undefined}>
                  {group.label && (
                    <div className="px-3 pb-1 text-[10.5px] font-semibold text-white/40 uppercase tracking-wide">
                      {group.label}
                    </div>
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-3 min-h-11 rounded-md text-[15px] text-white/85 hover:bg-ink-soft hover:text-white mb-0.5"
                      >
                        <Icon size={17} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="p-2.5 border-t border-ink-soft shrink-0">
              <Link href="/profil" className="block px-3 py-2 rounded-md hover:bg-ink-soft">
                <div className="text-sm text-white font-medium truncate">{userLabel}</div>
                <div className="text-xs text-white/60">{roleLabel}</div>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
