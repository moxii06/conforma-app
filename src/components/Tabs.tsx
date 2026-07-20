import Link from "next/link";

export function Tabs({
  basePath,
  tabs,
  active,
}: {
  basePath: string;
  tabs: { key: string; label: string }[];
  active: string;
}) {
  return (
    <div className="flex gap-1 px-8 border-b border-line">
      {tabs.map((t) => {
        const isDefault = t.key === tabs[0].key;
        const href = isDefault ? basePath : `${basePath}?tab=${t.key}`;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={href}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              isActive ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
