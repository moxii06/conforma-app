import { coursMisses, compterManques, BLOCAGE_LABELS, type CourseCompletenessInput } from "@/lib/courseCompleteness";

/**
 * Ce qui manque sur une formation, rattaché à ce que ça bloque.
 *
 * Contrepartie assumée du choix de ne rien rendre obligatoire à la création :
 * on n'empêche pas d'enregistrer une formation incomplète, on refuse
 * simplement de faire comme si elle l'était.
 *
 * Deux règles de rédaction qui font tout l'écart avec une liste de champs
 * vides :
 *   — on nomme la CONSÉQUENCE avant le champ (« bloque la publication de
 *     votre fiche », puis « prérequis »), parce que c'est la conséquence qui
 *     décide si ça vaut la peine de s'y mettre maintenant ;
 *   — chaque champ est un lien qui ouvre l'endroit où le corriger. Un
 *     bandeau qui signale sans emmener fait perdre le temps qu'il prétend
 *     faire gagner.
 *
 * Rien n'est rendu quand rien ne manque : un bandeau permanent « tout va
 * bien » finit par ne plus être lu, et emporte avec lui les fois où il dit
 * quelque chose.
 */
export function CourseCompletenessBanner({
  courseId,
  course,
}: {
  courseId: string;
  course: CourseCompletenessInput;
}) {
  const groupes = coursMisses(course);
  if (groupes.length === 0) return null;
  const total = compterManques(groupes);

  return (
    <div className="bg-white border border-line border-l-[3px] border-l-rust rounded-card p-4 mb-4">
      <div className="text-[13.5px] font-semibold text-ink">
        {total} information{total > 1 ? "s" : ""} manque{total > 1 ? "nt" : ""} sur cette formation
      </div>
      <div className="flex flex-col gap-2 mt-3">
        {groupes.map((g) => (
          <div key={g.blocage} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12.5px]">
            <span className="text-[10.5px] uppercase tracking-wide font-bold text-rust shrink-0">Bloque</span>
            <span className="text-slate">
              {BLOCAGE_LABELS[g.blocage]}
              {" — "}
              {g.champs.map((c, i) => (
                <span key={c.libelle}>
                  {i > 0 && ", "}
                  {/* Un <a> ordinaire, et non <Link> : c'est ce qui fait
                      marcher l'ancre. Quand seule l'ancre change, le
                      navigateur émet hashchange — que EditCourseForm écoute
                      pour s'ouvrir et venir sur le champ. La navigation
                      client de <Link> passe par history.pushState, qui
                      n'émet rien : le lien menait au bon onglet et
                      s'arrêtait là, formulaire replié. */}
                  <a
                    href={`/formations/${courseId}${c.ancre}`}
                    className="text-ink underline decoration-line hover:decoration-ink"
                  >
                    {c.libelle}
                  </a>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
