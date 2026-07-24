import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  ShieldCheck,
  Milestone,
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
// than shown disabled. Grouped into zones (audit UX juillet 2026: 14-16
// items à plat était le premier irritant identifié) so a role only ever
// scans the zones it actually has entries in — a group with zero visible
// items after permission filtering renders nothing, not an empty header.
const NAV_GROUPS: { label: string | null; items: { href: string; label: string; icon: typeof LayoutDashboard; feature: keyof typeof import("@/lib/tenant").PERMISSIONS }[] }[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, feature: "dashboard" },
      { href: "/mon-espace", label: "Mon espace", icon: User, feature: "portal" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { href: "/crm", label: "CRM commercial", icon: Users, feature: "crm" },
      { href: "/inbox", label: "Boîte mail", icon: Inbox, feature: "inbox" },
      { href: "/facturation", label: "Facturation", icon: Receipt, feature: "invoicing" },
    ],
  },
  {
    label: "Pédagogie",
    items: [
      { href: "/planning", label: "Planning des sessions", icon: Calendar, feature: "planning" },
      { href: "/formations", label: "Catalogue de formations", icon: GraduationCap, feature: "planning" },
      { href: "/dossiers", label: "Dossiers apprenants", icon: FileText, feature: "dossiers" },
      { href: "/documents", label: "Bibliothèque de documents", icon: Library, feature: "toolkit" },
    ],
  },
  {
    label: "Conformité",
    items: [
      { href: "/qualiopi", label: "Conformité Qualiopi", icon: ShieldCheck, feature: "qualiopi" },
      { href: "/rgpd", label: "Registre RGPD", icon: ScrollText, feature: "rgpd" },
      { href: "/bpf", label: "Bilan pédagogique et financier", icon: BarChart3, feature: "bpf" },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/team", label: "Équipe & rôles", icon: UserCog, feature: "team" },
      { href: "/integrations", label: "Intégrations", icon: Plug, feature: "integrations" },
    ],
  },
  {
    label: "Aide",
    items: [
      { href: "/faq", label: "FAQ & guides", icon: HelpCircle, feature: "faq" },
      { href: "/support", label: "Aide & demandes", icon: MessageCircleWarning, feature: "support" },
    ],
  },
];

export async function Sidebar({ user }: { user: SessionContext }) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(user.role, item.feature) !== "none"),
  })).filter((group) => group.items.length > 0);
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
              <Milestone size={17} className="text-ink" strokeWidth={2.4} />
            </div>
            <div className="font-display text-lg tracking-wide">Jalon</div>
          </div>
          {can(user.role, "dashboard") !== "none" && <NotificationBell tasks={tasks} userId={user.userId} />}
        </div>
        <div className="text-xs text-white/60 mt-1 pl-9">pour les organismes de formation</div>
      </div>
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
