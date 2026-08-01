import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { CATEGORY_LABELS } from "@/lib/documentCategories";
import { scopeOfCategory, scopeLabel } from "@/lib/documentScope";

// Le choix du type, première étape de la création.
//
// La pastille « Un par apprenant » / « Document unique » est visible DÈS
// ICI, avant tout travail. Le rattachement se déduit du type ; autant le
// dire tout de suite plutôt que de surprendre l'utilisateur au moment de
// l'envoi, quand il découvrirait que Jalon a produit huit PDF au lieu d'un.

export default async function NouveauDocumentPage() {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "dossiers") === "none" && can(role, "toolkit") === "none") redirect("/dashboard");

  // Le modèle adapté par l'organisme prime sur celui de Jalon, comme
  // partout ailleurs : deux entrées pour la même catégorie donneraient
  // deux cartes identiques dont une seule porte leurs propres clauses.
  const modèles = await prisma.documentTemplate.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    select: { id: true, title: true, category: true, organizationId: true, blocks: { select: { id: true } } },
    orderBy: [{ organizationId: "desc" }, { title: "asc" }],
  });

  const parCatégorie = new Map<string, (typeof modèles)[number]>();
  for (const m of modèles) if (!parCatégorie.has(m.category)) parCatégorie.set(m.category, m);
  const choix = [...parCatégorie.values()];

  return (
    <>
      <PageHeader
        title="Quel document voulez-vous créer ?"
        subtitle="Le type choisi détermine le modèle, les options disponibles et les destinataires possibles."
        action={
          <Link
            href="/documents"
            className="inline-flex items-center border border-line bg-white text-ink text-[13px] font-medium rounded-md px-3.5 py-2 hover:bg-pebble"
          >
            ← Retour aux documents
          </Link>
        }
      />
      <div className="p-8">
        {choix.length === 0 ? (
          <div className="bg-white border border-line rounded-card px-4 py-8 text-[12.5px] text-slate text-center max-w-xl">
            Aucun modèle disponible. Créez-en un depuis votre bibliothèque.
          </div>
        ) : (
          <div className="grid gap-3 max-w-4xl" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))" }}>
            {choix.map((m) => {
              const scope = scopeOfCategory(m.category);
              return (
                <Link
                  key={m.id}
                  href={`/documents/nouveau/${m.id}`}
                  className="bg-white border border-line rounded-card p-4 hover:border-seal hover:bg-mist flex flex-col gap-1.5"
                >
                  <div className="text-[13.5px] font-semibold text-ink">
                    {CATEGORY_LABELS[m.category] ?? m.title}
                  </div>
                  <div className="text-[11.5px] text-slate leading-snug flex-1">{m.title}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span
                      className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${
                        scope === "per_learner" ? "bg-[#EFE7D6] text-seal-dark" : "bg-[#E4EAE6] text-sage"
                      }`}
                    >
                      {scopeLabel(scope)}
                    </span>
                    {m.blocks.length > 0 && (
                      <span className="text-[10.5px] text-slate bg-linen rounded px-1.5 py-0.5">
                        {m.blocks.length} blocs
                      </span>
                    )}
                    {m.organizationId === null && (
                      <span className="text-[10.5px] text-slate bg-linen rounded px-1.5 py-0.5">Modèle Jalon</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
