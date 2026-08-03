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
    // overflow-x-auto + whitespace-nowrap + shrink-0 : sans ça, un flex item
    // texte peut se faire comprimer sous sa largeur naturelle et retourner à
    // la ligne dès que la barre est à la limite de la largeur disponible —
    // ce qui décale toute la mise en page selon l'onglet actif (ex. quand
    // "Audits" est sélectionné le texte tient sur une ligne, mais
    // "Indicateurs" fait passer le reste en dessous). Un défilement
    // horizontal est un compromis bien plus stable qu'un retour à la ligne
    // imprévisible.
    <div className="flex gap-1 px-8 border-b border-line overflow-x-auto">
      {tabs.map((t) => {
        const isDefault = t.key === tabs[0].key;
        const href = isDefault ? basePath : `${basePath}?tab=${t.key}`;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={href}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap ${
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
