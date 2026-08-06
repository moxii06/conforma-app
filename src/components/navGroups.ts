import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  ShieldCheck,
  ScrollText,
  UserCog,
  Library,
  Files,
  Receipt,
  Inbox,
  BarChart3,
  User,
  Plug,
  Zap,
  GraduationCap,
  HelpCircle,
  MessageCircleWarning,
  CreditCard,
} from "lucide-react";
import type { PERMISSIONS } from "@/lib/tenant";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  feature: keyof typeof PERMISSIONS;
};

// Extracted from Sidebar so the mobile drawer can render the same navigation
// without the two drifting apart. It lives in its own module rather than
// being passed as props because the icons are component references, which
// don't survive the server/client boundary — both sides import this instead.
//
// Each entry's `feature` key must match a key in PERMISSIONS (src/lib/tenant.ts)
// — items a role has no access to are hidden rather than shown disabled.
// Grouped into zones (audit UX juillet 2026: 14-16 items à plat était le
// premier irritant identifié) so a role only ever scans the zones it actually
// has entries in — a group with zero visible items after permission filtering
// renders nothing, not an empty header.
export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
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
      { href: "/formations", label: "Catalogue de formations", icon: GraduationCap, feature: "courses" },
      { href: "/dossiers", label: "Dossiers apprenants", icon: FileText, feature: "dossiers" },
      // Deux entrées, parce que ce sont deux choses.
      //
      // « Documents » contient les EXEMPLAIRES : le contrat de M. Benali,
      // brouillon puis finalisé puis envoyé puis signé. « Bibliothèque de
      // modèles » contient les PATRONS dont on les fabrique, et rien de ce
      // qui s'y trouve ne s'envoie à personne.
      //
      // La bibliothèque n'était atteignable que par un bouton depuis la
      // liste des documents : un espace de travail entier — adapter les
      // modèles, régler les clauses contractuelles — n'existait nulle part
      // dans la navigation. Le libellé dit « modèles » plutôt que « ma
      // bibliothèque » pour la même raison : « bibliothèque » à côté de
      // « documents » ne dit pas lequel contient quoi.
      { href: "/documents", label: "Documents", icon: Files, feature: "toolkit" },
      { href: "/documents/bibliotheque", label: "Bibliothèque de modèles", icon: Library, feature: "toolkit" },
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
      // Première entrée du groupe, et pour cause : forme juridique, RCS et
      // n° de déclaration d'activité vivent ici et alimentent toutes les
      // conventions générées. On n'y accédait qu'en cliquant son propre nom
      // en bas de la barre latérale — l'étape 1 du démarrage était la plus
      // cachée de l'application.
      { href: "/profil", label: "Mon profil", icon: User, feature: "profile" },
      { href: "/team", label: "Équipe & rôles", icon: UserCog, feature: "team" },
      { href: "/automatisations", label: "Automatisations", icon: Zap, feature: "automations" },
      { href: "/integrations", label: "Intégrations", icon: Plug, feature: "integrations" },
      // Reachable from the dashboard's trial banner too, but that banner only
      // renders while subscription.status is "trialing" — so the day the trial
      // expires, the one page a customer needs in order to start paying used
      // to disappear from the app entirely.
      { href: "/abonnement", label: "Abonnement", icon: CreditCard, feature: "billing" },
    ],
  },
  {
    label: "Aide",
    items: [
      { href: "/faq", label: "FAQ & guides", icon: HelpCircle, feature: "faq" },
      // Renommé : « Aide & demandes » ne délivrait aucune aide — c'est le
      // registre des réclamations et des signalements, un attendu Qualiopi
      // (indicateur 31). FEATURE_LABELS le nommait déjà correctement en
      // interne ; seule la navigation mentait.
      { href: "/support", label: "Réclamations & signalements", icon: MessageCircleWarning, feature: "support" },
    ],
  },
];
