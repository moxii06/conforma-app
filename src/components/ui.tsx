import Link from "next/link";

const METRIC_VALUE_TONES: Record<string, string> = {
  ink: "text-ink",
  danger: "text-rust",
  good: "text-sage",
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "ink",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof METRIC_VALUE_TONES;
  // Client feedback: a metric like "Factures en retard" was a dead end —
  // clicking it did nothing. When set, the whole card becomes a link to
  // where that number actually comes from.
  href?: string;
}) {
  const className = "bg-white border border-line rounded-card p-4 flex-1 block" + (href ? " hover:border-ink-soft transition-colors" : "");
  const content = (
    <>
      <div className="text-[12.5px] text-slate mb-2">{label}</div>
      <div className={`text-2xl font-mono font-semibold tabular-nums ${METRIC_VALUE_TONES[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate mt-1.5">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}

const PILL_STYLES: Record<string, string> = {
  neutral: "bg-pebble text-slate",
  warn: "bg-[#EDDFC6] text-seal-dark",
  danger: "bg-[#E9D8D3] text-rust",
  good: "bg-[#DEE5E0] text-sage",
};

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof PILL_STYLES }) {
  return (
    <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${PILL_STYLES[tone]}`}>
      {children}
    </span>
  );
}

// Two-letter monogram from any display name — skips pure-punctuation
// "words" (em-dashes in course titles like "Excel — niveau 2").
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// Initials avatar used by every identity/summary card (dossier, contact,
// entreprise, session…) so they all read as the same family of screens.
export function Avatar({ initials, size = "md" }: { initials: string; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "w-12 h-12 text-[17px]" : "w-10 h-10 text-[15px]";
  return (
    <div className={`${dims} rounded-lg bg-ink text-mist font-display flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  );
}

// Every displayed phone number goes through this so it is always dialable —
// a plain-text number is a dead end on mobile (audit S5 : zéro lien tel:
// dans l'app pour 7 numéros affichés). Color and size inherit from the
// surrounding text on purpose: the same link must sit in a muted 11px
// funder line and a 13px ink contact card without restyling either.
export function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="underline decoration-line hover:decoration-ink">
      {phone}
    </a>
  );
}

// One label/value line of an identity card's facts block.
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[12.5px]">
      <span className="text-slate uppercase text-[10.5px] tracking-wide font-semibold pt-0.5 shrink-0">{label}</span>
      <span className="text-ink text-right min-w-0">{children}</span>
    </div>
  );
}

const BANNER_TONES: Record<string, string> = {
  good: "bg-[#DEE5E0] border-[#c9d5cd] text-sage",
  warn: "bg-[#EDDFC6] border-[#dccba8] text-seal-dark",
  danger: "bg-[#E9D8D3] border-[#d9beb6] text-rust",
};

// Contextual status strip shown between the tabs and the page content —
// one load-bearing fact about the record plus the action it points to,
// never a stack of notifications.
export function ContextBanner({
  tone = "good",
  children,
  action,
}: {
  tone?: keyof typeof BANNER_TONES;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`mx-8 mt-4 flex items-center justify-between gap-3 border rounded-card px-4 py-2.5 text-[13px] ${BANNER_TONES[tone]}`}>
      <span>{children}</span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-8 pt-5 pb-4 border-b border-line">
      <div>
        <div className="font-display text-[22px] text-ink">{title}</div>
        {subtitle && <div className="text-[13px] text-slate mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
