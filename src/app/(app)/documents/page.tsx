import { prisma } from "@/lib/prisma";
import { PageHeader, Button } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { type Prisma } from "@prisma/client";
import { borneAuxSiennesDuFormateur } from "@/lib/proprieteRoles";
import { CATEGORY_LABELS, categoryLabelIsRedundant } from "@/lib/documentCategories";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { QueryFilterSelect, QueryChoiceSelect } from "@/components/QueryFilterSelect";
import { DocumentGroupList, type Group, type ListSection } from "@/components/DocumentGroupList";
import { Pagination } from "@/components/Pagination";
import Link from "next/link";
import { scopeOfCategory, scopeLabel } from "@/lib/documentScope";
import { isYousignConfigured } from "@/lib/yousign";
import {
  DOCUMENT_BUCKETS,
  documentBucket,
  groupDocuments,
  isSigned,
  batchProgressLabel,
  type DocumentBucket,
  type BatchMember,
} from "@/lib/documentLifecycle";
import {
  AXES_CLASSEMENT,
  AXE_LABELS,
  axeClassement,
  correspondAuxFiltres,
  decouperEnSections,
  ordonnerLots,
  optionsAnnee,
  optionsFormation,
  optionsType,
  HORS_FORMATION,
  HORS_FORMATION_LABEL,
  type LotClassable,
} from "@/lib/documentClassement";

// L'espace Documents : quatre onglets qui suivent la vie d'un document —
// brouillon, finalisé, envoyé, signé. Les modèles ont déménagé dans
// /documents/bibliotheque : un modèle sert à FABRIQUER un document, il ne
// s'envoie pas, et les mélanger rendait « mon contrat » ambigu (le modèle,
// ou l'exemplaire signé de M. Benali ?).
//
// L'onglet dit OÙ EN EST un document. Il ne dit pas LEQUEL c'est — et chez
// un organisme qui a trois ans derrière lui, « Mes documents envoyés » finit
// par contenir deux mille envois dans une liste chronologique à plat.
// D'où le second axe, à l'intérieur de chaque onglet : trois filtres
// cumulables (formation, type, année) et un classement (par mois, par
// formation, par type) qui pose des intertitres dans la liste. Toute la
// logique est dans documentClassement.ts, testée, et travaille sur des LOTS
// puisque c'est l'unité affichée.

const VIDE: Record<DocumentBucket, string> = {
  draft: "Aucun brouillon en cours. Les documents que vous commencez sans les finir se retrouvent ici.",
  final: "Aucun document finalisé en attente d'envoi.",
  sent: "Aucun document envoyé pour le moment.",
  signed: "Aucun document signé pour le moment. Les signatures Yousign arrivent ici automatiquement ; un document signé sur papier s'y ajoute via « Marquer signé ».",
};

// Vingt-cinq LOTS par page, pas vingt-cinq documents : c'est le lot qui est
// l'unité d'action ici (« relancer les 3 qui n'ont pas signé »), et une
// pagination par document couperait un lot en deux pages.
const PAGE_SIZE = 25;

export default async function DocumentsPage(props: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    category?: string;
    formation?: string;
    annee?: string;
    classer?: string;
    page?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const { organizationId, roles, userId } = await requireSessionContext();
  if (can(roles, "dossiers") === "none" && can(roles, "toolkit") === "none") redirect("/dashboard");

  const activeTab = (DOCUMENT_BUCKETS.find((b) => b.key === searchParams.tab)?.key ?? "draft") as DocumentBucket;
  const q = searchParams.q?.trim();
  const filtres = {
    category: searchParams.category || undefined,
    formation: searchParams.formation || undefined,
    annee: searchParams.annee || undefined,
  };
  const axe = axeClassement(searchParams.classer);
  const filtreActif = Boolean(q || filtres.category || filtres.formation || filtres.annee);

  // Un formateur ne voit que les documents des dossiers de SES sessions —
  // le filtre imbriqué exclut aussi, au passage, les documents sans dossier
  // (prospect, sous-traitant), ce qui est le comportement voulu.
  //
  // Sur les rôles effectifs, pas sur le rôle principal : voir
  // lib/proprieteRoles.ts.
  const ownerFilter: Prisma.DocumentWhereInput = borneAuxSiennesDuFormateur(roles)
    ? { dossier: { session: { trainerId: userId } } }
    : {};

  // Les trois filtres (type, formation, année) ne sont PAS dans le SQL :
  // ils s'appliquent en mémoire sur la première passe. C'est ce qui permet
  // de proposer des menus dont chaque entrée porte son compte exact — un
  // menu construit après filtrage ne saurait plus que compter ce qu'il a
  // déjà retenu, et se viderait de ses propres options à mesure qu'on
  // l'utilise.
  const where: Prisma.DocumentWhereInput = {
    organizationId,
    archivedAt: null,
    ...ownerFilter,
    // La recherche porte sur les QUATRE rattachements possibles d'un
    // document (dossier, prospect, sous-traitant, membre d'équipe), pas
    // seulement sur les deux premiers : le nom du sous-traitant est affiché
    // dans la liste par recipientOf, donc le chercher est le réflexe — et il
    // ne rendait rien.
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { dossier: { contact: { firstName: { contains: q, mode: "insensitive" } } } },
            { dossier: { contact: { lastName: { contains: q, mode: "insensitive" } } } },
            { contact: { firstName: { contains: q, mode: "insensitive" } } },
            { contact: { lastName: { contains: q, mode: "insensitive" } } },
            { subcontractor: { name: { contains: q, mode: "insensitive" } } },
            { user: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  // Deux passes, comme /dossiers — et pour la même raison : l'unité
  // affichée (le lot) n'est pas l'unité stockée (le document).
  //
  // La version précédente prenait les 600 documents les plus récents, sans
  // le dire. Les conséquences dépassaient la liste : les compteurs
  // d'onglets étaient calculés sur ces 600, donc « Mes documents envoyés
  // (150) » était faux dès qu'un organisme dépassait ce seuil, et un
  // document plus ancien devenait introuvable autrement que par la
  // recherche.
  //
  // Première passe : les sept champs qui suffisent à regrouper et à situer
  // chaque document, sur la TOTALITÉ de ce qui correspond au filtre. Sept
  // colonnes scalaires se lisent vite, même à plusieurs milliers de lignes,
  // et c'est ce qui permet des compteurs exacts.
  // `courseId` et non le titre : un identifiant se répète sans coût sur des
  // milliers de lignes, et les titres se résolvent en une requête à part.
  const situation = await prisma.document.findMany({
    where,
    select: {
      id: true,
      batchId: true,
      createdAt: true,
      status: true,
      sentByUserId: true,
      signatureStatus: true,
      signedAt: true,
      category: true,
      dossier: { select: { session: { select: { courseId: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const titreParFormation = new Map(
    (await prisma.course.findMany({ where: { organizationId }, select: { id: true, title: true } })).map((c) => [
      c.id,
      c.title,
    ])
  );

  // On regroupe, on situe, on compte — puis on ne va chercher le détail que
  // des lots de la page demandée.
  const groupesLegers = groupDocuments(
    situation.map((d) => ({
      ...d,
      title: "",
      recipientName: null,
      courseId: d.dossier?.session.courseId ?? null,
    }))
  );

  /** Ce qu'il faut savoir d'un lot pour le classer, lu sur son premier membre. */
  const classableDe = (g: (typeof groupesLegers)[number]): LotClassable => {
    const premier = g.members[0];
    return {
      key: g.key,
      createdAt: premier.createdAt,
      courseId: premier.courseId,
      formation: premier.courseId ? (titreParFormation.get(premier.courseId) ?? null) : null,
      category: premier.category,
      typeLabel: CATEGORY_LABELS[premier.category] ?? premier.category,
    };
  };
  const classableParCle = new Map(groupesLegers.map((g) => [g.key, classableDe(g)]));
  const classable = (g: { key: string }) => classableParCle.get(g.key)!;

  // Les menus sont construits sur l'onglet actif AVANT filtrage : chaque
  // entrée annonce donc combien de lots elle contient réellement ici, et
  // aucune ne disparaît sous les doigts de celui qui filtre.
  const lotsOngletBrut = groupesLegers.filter((g) => g.bucket === activeTab).map(classable);
  const optionsFormationOnglet = complete(
    optionsFormation(lotsOngletBrut),
    filtres.formation,
    (v) => (v === HORS_FORMATION ? HORS_FORMATION_LABEL : (titreParFormation.get(v) ?? "Formation sélectionnée"))
  );
  const optionsTypeOnglet = complete(optionsType(lotsOngletBrut), filtres.category, (v) => CATEGORY_LABELS[v] ?? v);
  const optionsAnneeOnglet = complete(optionsAnnee(lotsOngletBrut), filtres.annee, (v) => v);

  const groupesFiltres = groupesLegers.filter((g) => correspondAuxFiltres(classable(g), filtres));
  const counts = DOCUMENT_BUCKETS.reduce<Record<string, number>>((acc, b) => {
    acc[b.key] = groupesFiltres.filter((g) => g.bucket === b.key).length;
    return acc;
  }, {});

  // Le classement porte sur la totalité de l'onglet, jamais sur la page :
  // reclasser vingt-cinq lignes déjà tirées par date laisserait la formation
  // cherchée dispersée sur quarante pages.
  const groupesOnglet = ordonnerLots(
    groupesFiltres.filter((g) => g.bucket === activeTab).map((g) => ({ ...classable(g), groupe: g })),
    axe
  );
  const totalPages = Math.max(1, Math.ceil(groupesOnglet.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1), totalPages);
  const lotsPage = groupesOnglet.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const clesPage = lotsPage.map((l) => l.key);
  const idsPage = lotsPage.flatMap((l) => l.groupe.members.map((m) => m.id));

  // Seconde passe : le détail, pour ces documents-là seulement.
  const rows = idsPage.length
    ? await prisma.document.findMany({
        where: { id: { in: idsPage } },
        select: {
          id: true,
          title: true,
          category: true,
          createdAt: true,
          status: true,
          batchId: true,
          // Le modèle d'origine : c'est lui qui permet de rouvrir un brouillon
          // dans l'écran de création plutôt que dans la visionneuse PDF.
          templateOrigin: true,
          sentByUserId: true,
          signatureStatus: true,
          signedAt: true,
          // fileUrl et non bodyText : le schéma garantit que l'un des deux
          // est toujours posé, et un document généré porte le texte entier
          // du contrat. On chargeait donc des mégaoctets de clauses pour
          // tester une seule chose — le document a-t-il un fichier, ou
          // faut-il le rendre depuis son texte.
          fileUrl: true,
          dossier: { select: { contact: { select: { firstName: true, lastName: true } }, session: { select: { course: { select: { title: true } } } } } },
          contact: { select: { firstName: true, lastName: true } },
          subcontractor: { select: { name: true } },
          // Le quatrième propriétaire possible : un document rattaché à un
          // membre de l'équipe (CV, diplôme). Sans lui, la ligne s'affichait
          // sans aucun destinataire.
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const canMarkSigned = can(roles, "dossiers") !== "none";
  // La signature électronique n'est proposée que si elle est réellement
  // branchée — cocher une case qui ne fait rien serait pire que son absence.
  //
  // Par isYousignConfigured et non par process.env : la clé de l'organisme
  // (saisie sur /integrations) suffit à elle seule, la clé plateforme n'est
  // qu'un repli. Lire l'environnement seul faisait disparaître la case ici
  // alors que le CRM et la fiche sous-traitant la proposaient — même
  // organisme, même document, deux réponses.
  const signatureAvailable = await isYousignConfigured(organizationId);
  // La signature de mail de l'expéditeur (réglée sur /profil) — résolue ici,
  // côté serveur, jamais reconstruite depuis des données transmises par le
  // client. Même contrainte que partout ailleurs où elle s'insère.
  const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { emailSignature: true } });
  const signatureHtml = currentUser?.emailSignature ?? "";

  // Inféré du select ci-dessus plutôt qu'écrit à la main : un champ ajouté
  // au select suit tout seul, et rien ne peut diverger silencieusement.
  type Ligne = (typeof rows)[number];
  const members: (BatchMember & { row: Ligne })[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    recipientName: recipientOf(r),
    status: r.status,
    sentByUserId: r.sentByUserId,
    signatureStatus: r.signatureStatus,
    signedAt: r.signedAt,
    batchId: r.batchId,
    row: r,
  }));

  // Les lots de la page, dans l'ordre décidé par la première passe : c'est
  // elle qui a vu l'ensemble et qui sait donc quel lot vient avant quel
  // autre.
  const parCle = new Map(groupDocuments(members).map((g) => [g.key, g]));
  const affichés = new Map<string, Group>(
    clesPage
      .map((cle) => parCle.get(cle))
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map((g) => {
      const premier = g.members[0].row;
      return [g.key, {
        key: g.key,
        title: g.title,
        subtitle: sousTitre(premier, g.isBatch),
        dateLabel: new Date(premier.createdAt).toLocaleDateString("fr-FR"),
        categoryLabel: categoryLabelIsRedundant(g.title, premier.category)
          ? null
          : (CATEGORY_LABELS[premier.category] ?? premier.category),
        progressLabel: batchProgressLabel(g),
        isBatch: g.isBatch,
        // Le bouton n'apparaît que dans « finalisés » : envoyer un
        // brouillon n'a pas de sens, et renvoyer depuis « envoyés »
        // dupliquerait le document sans que personne ne l'ait demandé.
        sendable:
          activeTab === "final"
            ? { scopeLabel: scopeLabel(scopeOfCategory(premier.category)), signatureAvailable, signatureHtml }
            : null,
        members: g.members.map((m) => {
          const r = m.row;
          const signé = isSigned(m);
          return {
            id: m.id,
            recipientName: m.recipientName,
            signed: signé,
            signedLabel: signé && r.signedAt ? `Signé le ${new Date(r.signedAt).toLocaleDateString("fr-FR")}` : signé ? "Signé" : null,
            // Un brouillon se ROUVRE, il ne se consulte pas : le PDF d'un
            // texte inachevé n'intéresse personne, et c'est l'édition
            // qu'on venait reprendre. L'écran de création sait déjà
            // recharger un brouillon via ?doc= — il n'y avait simplement
            // aucun lien qui y menait.
            href: hrefDe(m, r),
            // Un PDF s'ouvre à côté, une page de Jalon dans l'onglet
            // courant : rouvrir un brouillon dans un nouvel onglet
            // laisserait derrière soi une liste devenue périmée.
            external: !(m.status === "draft" && r.templateOrigin),
            // Proposé seulement là où il a un sens : déclarer signé un
            // document qui n'est même pas parti n'en est pas un.
            canMarkSigned: canMarkSigned && !signé && documentBucket(m) === "sent",
          };
        }),
      }] as const;
    })
  );

  // Les intertitres se posent sur la PAGE affichée, l'ordre ayant déjà été
  // décidé sur l'ensemble : une section qui déborde sur la page suivante y
  // réaffiche simplement son titre.
  const sections: ListSection[] = decouperEnSections(lotsPage, axe).map((s) => ({
    key: s.key,
    label: s.label,
    groups: s.lots.map((l) => affichés.get(l.key)).filter((g): g is Group => Boolean(g)),
  }));

  const TABS = DOCUMENT_BUCKETS.map((b) => ({ key: b.key, label: `${b.label} (${counts[b.key] ?? 0})` }));

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle={DOCUMENT_BUCKETS.find((b) => b.key === activeTab)?.hint}
        action={
          <div className="flex items-center gap-2.5">
            <Button href="/documents/bibliotheque" variant="secondary">
              Accéder à ma bibliothèque
            </Button>
            <Button href="/documents/nouveau">+ Créer un document</Button>
          </div>
        }
      />
      <Tabs basePath="/documents" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-4xl">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <SearchInput placeholder="Rechercher un document ou un destinataire…" />
            <QueryFilterSelect param="formation" allLabel="Toutes les formations" options={optionsFormationOnglet} />
            <QueryFilterSelect param="category" allLabel="Tous les types" options={optionsTypeOnglet} />
            <QueryFilterSelect param="annee" allLabel="Toutes les années" options={optionsAnneeOnglet} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <QueryChoiceSelect
              param="classer"
              label="Classer par"
              value={axe}
              options={AXES_CLASSEMENT.map((a) => ({ value: a, label: AXE_LABELS[a] }))}
            />
            <div className="text-[12px] text-slate">
              {groupesOnglet.length} envoi{groupesOnglet.length > 1 ? "s" : ""}
            </div>
            {filtreActif && (
              // Un filtre posé trois écrans plus tôt explique la plupart des
              // « mon document a disparu ». Le chemin du retour doit être
              // visible sans avoir à retrouver quel menu on avait touché.
              <Link
                href={activeTab === "draft" ? "/documents" : `/documents?tab=${activeTab}`}
                className="text-[12px] text-seal hover:underline"
              >
                Réinitialiser les filtres
              </Link>
            )}
          </div>
        </div>
        <DocumentGroupList
          sections={sections}
          emptyLabel={filtreActif ? "Aucun document ne correspond à cette recherche." : VIDE[activeTab]}
        />
        <Pagination
          basePath="/documents"
          searchParams={{
            tab: searchParams.tab,
            q,
            category: filtres.category,
            formation: filtres.formation,
            annee: filtres.annee,
            classer: searchParams.classer,
            page: searchParams.page,
          }}
          page={page}
          totalPages={totalPages}
        />
      </div>
    </>
  );
}

/**
 * Garde dans le menu une valeur active qui n'a plus d'occurrence ici.
 *
 * Sans ça, filtrer sur une formation puis changer d'onglet laisse un
 * `<select>` dont la valeur ne figure dans aucune option : le navigateur
 * l'affiche vide, la liste est filtrée, et plus rien à l'écran ne dit
 * pourquoi. L'entrée réapparaît donc avec son compte réel — zéro.
 */
function complete(
  options: { value: string; label: string; count: number }[],
  actif: string | undefined,
  libelle: (v: string) => string
): { value: string; label: string; count: number }[] {
  if (!actif || options.some((o) => o.value === actif)) return options;
  return [...options, { value: actif, label: libelle(actif), count: 0 }];
}

/** Où mène un clic sur un document. */
function hrefDe(m: BatchMember, r: { id: string; fileUrl: string | null; templateOrigin: string | null }): string {
  // Le brouillon repart en édition. Sans modèle d'origine — cas qui ne
  // devrait pas exister, les brouillons étant tous créés par
  // /api/documents/draft — on retombe sur la consultation plutôt que de
  // fabriquer une URL qui donnerait un 404.
  if (m.status === "draft" && r.templateOrigin) {
    return `/documents/nouveau/${r.templateOrigin}?doc=${r.id}`;
  }
  // Un document porte soit un fichier, soit son texte — jamais ni l'un ni
  // l'autre (voir le commentaire de Document.fileUrl dans le schéma). Tester
  // l'absence de fichier revient donc à tester la présence du texte, sans
  // avoir à charger des pages de contrat pour le savoir.
  //
  // Un document rédigé ici s'ouvre dans une PAGE et non à une URL d'API :
  // le clic menait droit à /api/documents/generated/<id>, sans titre, sans
  // retour, sans contexte. Un fichier téléversé n'a rien à afficher d'autre
  // que ses octets — il part donc directement.
  return r.fileUrl ? `/api/documents/${r.id}/file` : `/documents/apercu/${r.id}`;
}

type Row = {
  dossier: { contact: { firstName: string; lastName: string }; session: { course: { title: string } } } | null;
  contact: { firstName: string; lastName: string } | null;
  subcontractor: { name: string } | null;
  user: { name: string } | null;
};

/**
 * À qui ce document se rapporte, quel que soit le rattachement utilisé.
 *
 * Les quatre propriétaires possibles d'un Document, dans le même ordre que le
 * schéma : apprenant (par son dossier), prospect, sous-traitant, membre de
 * l'équipe. Les clauses de recherche du `where` ci-dessus doivent couvrir
 * exactement ces quatre-là — un nom affiché ici mais absent de la recherche
 * fait disparaître la ligne dès qu'on le tape.
 */
function recipientOf(r: Row): string | null {
  if (r.dossier) return `${r.dossier.contact.firstName} ${r.dossier.contact.lastName}`;
  if (r.contact) return `${r.contact.firstName} ${r.contact.lastName}`;
  if (r.subcontractor) return r.subcontractor.name;
  if (r.user) return r.user.name;
  return null;
}

function sousTitre(r: Row, isBatch: boolean): string | null {
  // Sur un lot, le nom du premier destinataire serait trompeur : c'est la
  // formation qui identifie l'envoi.
  if (isBatch) return r.dossier?.session.course.title ?? null;
  const nom = recipientOf(r);
  const formation = r.dossier?.session.course.title;
  return [nom, formation].filter(Boolean).join(" — ") || null;
}
