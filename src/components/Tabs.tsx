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
    // Le trait gris appartient au conteneur EXTÉRIEUR, pas au défileur.
    //
    // Il y était, et le `-mb-px` de l'onglet actif — qui sert à faire
    // fusionner son soulignement avec ce trait — débordait alors d'un pixel
    // vers le bas À L'INTÉRIEUR d'un élément en overflow-x-auto. Or dès
    // qu'un seul axe n'est plus `visible`, CSS bascule l'autre en `auto` :
    // ce pixel suffisait à faire apparaître une barre de défilement
    // VERTICALE sur toute la hauteur de la barre d'onglets, sur tous les
    // écrans de Jalon. Le décalage est donc porté par le défileur lui-même,
    // ce qui ne crée aucun débordement interne.
    <div className="border-b border-line">
      {/* overflow-x-auto + whitespace-nowrap + shrink-0 : sans ça, un flex
          item texte peut se faire comprimer sous sa largeur naturelle et
          retourner à la ligne dès que la barre est à la limite de la
          largeur disponible — ce qui décale toute la mise en page selon
          l'onglet actif. Un défilement horizontal est un compromis bien
          plus stable qu'un retour à la ligne imprévisible. */}
      <div className="flex gap-1 px-8 overflow-x-auto -mb-px">
        {tabs.map((t) => {
          const isDefault = t.key === tabs[0].key;
          const href = isDefault ? basePath : `${basePath}?tab=${t.key}`;
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={href}
              className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap ${
                isActive ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
