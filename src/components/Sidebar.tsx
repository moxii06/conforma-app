import Link from "next/link";
import { Milestone } from "lucide-react";
import { can, ROLE_LABELS, type SessionContext } from "@/lib/tenant";
import { SignOutButton } from "@/components/SignOutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NAV_GROUPS } from "@/components/navGroups";


export async function Sidebar({
  user,
  organization,
}: {
  user: SessionContext;
  organization?: { name: string; logoUrl: string | null; brandColor: string | null };
}) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(user.role, item.feature) !== "none"),
  })).filter((group) => group.items.length > 0);
  // Le calcul de la liste « à faire » vivait ici — donc dans le layout
  // partagé, donc sur CHAQUE page, et une seconde fois sur le tableau de
  // bord qui la recalcule pour lui-même. Une quinzaine de requêtes par
  // navigation pour alimenter un compteur. La cloche la récupère elle-même
  // après le rendu (voir /api/notifications).

  // Marque blanche: a LEARNER is the OFP's own customer, not Jalon's — the
  // public token pages (formulaire/satisfaction/activation) already carry
  // the org's identity instead of Jalon's, this brings the authenticated
  // portal in line. Staff keep the regular Jalon chrome unchanged, since
  // they ARE Jalon's customers and it's useful for them to know what tool
  // they're using.
  const isLearnerPortal = user.role === "LEARNER" && organization;
  const brandName = isLearnerPortal ? organization.name : "Jalon";
  const brandSubtitle = isLearnerPortal ? "Votre espace de formation" : "pour les organismes de formation";

  return (
    // Hidden below `md`, where its fixed 240 px left ~135 px of content on a
    // phone. MobileNav takes over there — see (app)/layout.tsx.
    <div className="hidden md:flex w-60 h-screen bg-ink text-white flex-col shrink-0">
      <div className="px-5 pt-6 pb-4 border-b border-ink-soft shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {isLearnerPortal && organization.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={organization.logoUrl} alt={organization.name} className="w-7 h-7 rounded-md object-contain shrink-0" />
            ) : (
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isLearnerPortal && organization.brandColor ? "" : "bg-seal"}`}
                style={isLearnerPortal && organization.brandColor ? { backgroundColor: organization.brandColor } : undefined}
              >
                <Milestone size={17} className="text-ink" strokeWidth={2.4} />
              </div>
            )}
            <div className="font-display text-lg tracking-wide truncate">{brandName}</div>
          </div>
          {can(user.role, "dashboard") !== "none" && <NotificationBell userId={user.userId} />}
        </div>
        <div className="text-xs text-white/60 mt-1 pl-9">{brandSubtitle}</div>
      </div>
      {can(user.role, "dashboard") !== "none" && (
        <div className="px-2.5 pt-2.5 shrink-0">
          <GlobalSearch />
        </div>
      )}
      {/* min-h-0 overrides the flex-item default of min-height:auto, which
          is what let 14 nav items push this taller than the viewport and
          shove the footer (user name + sign out) out of view instead of
          scrolling in place. */}
      <nav className="p-2.5 flex-1 min-h-0 overflow-y-auto">
        {groups.map((group, i) => (
          <div key={group.label ?? "home"} className={i > 0 ? "mt-3 pt-3 border-t border-ink-soft/60" : undefined}>
            {group.label && (
              <div className="px-3 pb-1 text-[10.5px] font-semibold text-white/40 uppercase tracking-wide">{group.label}</div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white/80 hover:bg-ink-soft hover:text-white mb-0.5"
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-2.5 border-t border-ink-soft shrink-0">
        <Link href="/profil" className="block px-3 py-2 rounded-md hover:bg-ink-soft">
          <div className="text-sm text-white font-medium truncate">{user.name || user.email}</div>
          <div className="text-xs text-white/60">{ROLE_LABELS[user.role]}</div>
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}
