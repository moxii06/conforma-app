import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Article(s) SEO ajouté(s) par la mission acquisition. Le site avait déjà un
// jeu d'articles (facturation électronique, BPF, registre RGPD, réforme
// Qualiopi, formation à distance) — on n'ajoute donc QUE des sujets inédits
// pour éviter le cannibalisme SEO (deux pages visant le même mot-clé se
// concurrencent). Ici : "préparer son audit de surveillance Qualiopi", qui
// complète l'article existant sur la réforme du référentiel sans le doublonner.
//
// Convention du body (voir src/app/actualites/[slug]/page.tsx) : paragraphes
// séparés par une ligne vide, **gras**, blocs de lignes "- " pour les listes.
//
// Idempotent : upsert par slug + suppression défensive d'anciens doublons
// introduits par erreur. Publier : npm run prisma:seed:news
type Article = { slug: string; title: string; category: string; excerpt: string; publishedAt: Date; body: string };

// Slugs de doublons créés lors d'une première passe, retirés car des articles
// équivalents existaient déjà sur le site (rédigés séparément).
const REMOVE_SLUGS = [
  "facturation-electronique-2026-organismes-formation",
  "remplir-bilan-pedagogique-financier-bpf",
  "registre-rgpd-organisme-de-formation",
];

const ARTICLES: Article[] = [
  {
    slug: "preparer-audit-surveillance-qualiopi",
    title: "Préparer son audit de surveillance Qualiopi : la checklist des 7 critères",
    category: "qualiopi",
    excerpt:
      "L'audit de surveillance arrive vite après la certification. Voici ce que vérifie l'auditeur, critère par critère, et comment garder vos preuves prêtes toute l'année.",
    publishedAt: new Date("2026-05-15T09:00:00Z"),
    body: `L'audit de surveillance intervient à mi-parcours du cycle de certification, généralement entre le 14e et le 22e mois après l'audit initial. Il est plus court qu'un audit complet, mais il porte sur les mêmes exigences : l'auditeur vient vérifier que votre organisme applique toujours, **au quotidien et sur des cas réels**, les engagements du Référentiel National Qualité.

La difficulté n'est presque jamais de "connaître" les critères. C'est de **retrouver les preuves** le jour J : conventions signées, feuilles d'émargement, évaluations, traitement d'une réclamation… éparpillées entre un tableur, une boîte mail et un dossier partagé.

**Ce que regarde l'auditeur, critère par critère**

- Critère 1 — Information du public : vos prestations sont-elles décrites de façon accessible (prérequis, objectifs, durée, tarifs, délais d'accès) et vos indicateurs de résultats diffusés ?
- Critère 2 — Objectifs et analyse du besoin : chaque formation a-t-elle des objectifs évaluables, et analysez-vous le besoin avant l'entrée en formation ?
- Critère 3 — Adaptation et suivi : adaptez-vous la prestation aux publics, et suivez-vous assiduité et atteinte des objectifs ?
- Critère 4 — Moyens : vos moyens pédagogiques, techniques et d'encadrement sont-ils formalisés et cohérents avec ce que vous vendez ?
- Critère 5 — Compétences : suivez-vous la qualification et la montée en compétences de vos intervenants ?
- Critère 6 — Environnement : réalisez-vous une veille (légale, métier) et prenez-vous en compte le handicap ?
- Critère 7 — Amélioration continue : recueillez-vous les appréciations et traitez-vous réclamations et non-conformités, avec des actions tracées ?

**Les points qui coûtent le plus souvent une non-conformité**

- Des indicateurs de résultats absents ou introuvables sur vos supports.
- Un recueil des besoins réalisé mais non conservé (donc "non prouvé").
- Aucune trace écrite du traitement d'une réclamation ou d'une non-conformité.
- Une veille réglementaire dont vous parlez… mais que rien ne documente.

**Se préparer sans y passer ses nuits**

Le secret n'est pas de tout reconstituer la veille, mais de **produire la preuve au moment où l'action a lieu**. Une convocation envoyée, une évaluation collectée, une réclamation traitée : si chacune se range automatiquement au bon endroit, votre dossier d'audit se construit tout seul, au fil de l'année.

Cet article est une aide à la préparation ; il ne préjuge pas du résultat de votre audit, qui dépend de votre organisme et de votre auditeur.`,
  },
];

async function main() {
  const removed = await prisma.newsArticle.deleteMany({ where: { slug: { in: REMOVE_SLUGS } } });
  if (removed.count) console.log(`Doublons supprimés : ${removed.count}`);

  for (const a of ARTICLES) {
    await prisma.newsArticle.upsert({
      where: { slug: a.slug },
      update: { title: a.title, category: a.category, excerpt: a.excerpt, body: a.body, publishedAt: a.publishedAt },
      create: a,
    });
    console.log("upsert:", a.slug);
  }
  const count = await prisma.newsArticle.count();
  console.log(`\nOK. Total articles en base : ${count}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
