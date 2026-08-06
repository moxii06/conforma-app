"use client";

import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/documentCategories";
import { QueryFilterSelect } from "@/components/QueryFilterSelect";

// Le filtre par catégorie de la bibliothèque de MODÈLES : la liste complète,
// sans comptage. Un modèle absent d'une catégorie est une catégorie qu'on
// peut vouloir garnir, alors qu'un document absent d'une catégorie n'est
// qu'un menu qui ne sert à rien — c'est pourquoi l'espace Documents, lui,
// construit ses options à partir de ce qu'il possède réellement.
export function DocumentCategoryFilter() {
  return (
    <QueryFilterSelect
      param="category"
      allLabel="Toutes les catégories"
      options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
    />
  );
}
