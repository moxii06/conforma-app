import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  ShieldCheck,
  ScrollText,
  UserCog,
  Library,
  Receipt,
  Inbox,
  BarChart3,
  User,
  Plug,
  GraduationCap,
  HelpCircle,
  MessageCircleWarning,
} from "lucide-react";
import { can, ROLE_LABELS, type SessionContext } from "@/lib/tenant";
import { SignOutButton } from "@/components/SignOutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { getDashboardTasks } from "@/lib/dashboardTasks";

// Each entry's `feature` key must match a key in PERMISSIONS
// (src/lib/tenant.ts) — items a role has no access to are hidden rather
// than shown disabled.
const NAV = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, feature: "dashboard" as const },
  { href: "/mon-espace", label: "Mon espace", icon: User, feature: "portal" as const },
  { href: "/crm", label: "CRM commercial", icon: Users, feature: "crm" as const },
  { href: "/planning", label: "Planning des sessions", icon: Calendar, feature: "planning" as const },
  { href: "/formations", label: "Catalogue de formations", icon: GraduationCap, feature: "planning" as const },
  { href: "/dossiers", label: "Dossiers apprenants", icon: FileText, feature: "dossiers" as const },
  { href: "/facturation", label: "Facturation", icon: Receipt, feature: "invoicing" as const },
  { href: "/inbox", label: "Boîte mail", icon: Inbox, feature: "inbox" as const },
  { href: "/documents", label: "Bibliothèque de documents", icon: Library, feature: "toolkit" as const },
  { href: "/qualiopi", label: "Conformité Qualiopi", icon: ShieldCheck, feature: "qualiopi" as const },
  { href: "/rgpd", label: "Registre RGPD", icon: ScrollText, feature: "rgpd" as const },
  { href: "/bpf", label: "Bilan pédagogique et financier", icon: BarChart3, feature: "bpf" as const },
  { href: "/team", label: "Équipe & rôles", icon: UserCog, feature: "team" as const },
  { href: "/integrations", label: "Intégrations", icon: Plug, feature: "integrations" as const },
  { href: "/faq", label: "FAQ & guides", icon: HelpCircle, feature: "faq" as const },
  { href: "/support", label: "Aide & demandes", icon: MessageCircleWarning, feature: "support" as const },
];

export async function Sidebar({ user }: { user: SessionContext }) {
  const items = NAV.filter((item) => can(user.role, item.feature) !== "none");
  const tasks =
    can(user.role, "dashboard") !== "none"
      ? await getDashboardTasks(user.organizationId, user.role, user.userId)
      : [];

  return (
    <div className="w-60 h-screen bg-ink text-white flex flex-col shrink-0">
      <div className="px-5 pt-6 pb-4 border-b border-ink-soft shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-seal flex items-center justify-center">
              <ShieldCheck size={17} className="text-ink" strokeWidth={2.4} />
            </div>
            <div className="font-display text-lg tracking-wide">Conforma</div>
          </div>
          {can(user.role, "dashboard") !== "none" && <NotificationBell tasks={tasks} />}
        </div>
        <div className="text-xs text-white/60 mt-1 pl-9">pour les organismes de formation</div>
      </div>
      {/* min-h-0 overrides the flex-item default of min-height:auto, which
          is what let 14 nav items push this taller than the viewport and
          shove the footer (user name + sign out) out of view instead of
          scrolling in place. */}
      <nav className="p-2.5 flex-1 min-h-0 overflow-y-auto">
        {items.map((item) => {
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
