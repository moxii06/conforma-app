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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof METRIC_VALUE_TONES;
}) {
  return (
    <div className="bg-white border border-line rounded-card p-4 flex-1">
      <div className="text-[12.5px] text-slate mb-2">{label}</div>
      <div className={`text-2xl font-display ${METRIC_VALUE_TONES[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate mt-1.5">{hint}</div>}
    </div>
  );
}

const PILL_STYLES: Record<string, string> = {
  neutral: "bg-[#F1EFE8] text-slate",
  warn: "bg-[#F7E3DA] text-seal-dark",
  danger: "bg-[#F5DFD8] text-rust",
  good: "bg-[#E5EBE1] text-sage",
};

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof PILL_STYLES }) {
  return (
    <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${PILL_STYLES[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between px-8 pt-5 pb-4 border-b border-line">
      <div>
        <div className="font-display text-[22px] text-ink">{title}</div>
        {subtitle && <div className="text-[13px] text-slate mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}
