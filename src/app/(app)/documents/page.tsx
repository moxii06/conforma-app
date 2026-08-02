import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role, type Prisma } from "@prisma/client";
import { CATEGORY_LABELS, categoryLabelIsRedundant } from "@/lib/documentCategories";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { DocumentCategoryFilter } from "@/components/DocumentCategoryFilter";
import { DocumentGroupList, type Group } from "@/components/DocumentGroupList";
import { scopeOfCategory, scopeLabel } from "@/lib/documentScope";
import {
  DOCUMENT_BUCKETS,
  documentBucket,
  groupDocuments,
  isSigned,
  batchProgressLabel,
  type DocumentBucket,
  type BatchMember,
} from "@/lib/documentLifecycle";

// L'espace Documents : quatre onglets qui suivent la vie d'un document —
// brouillon, finalisé, envoyé, signé. Les modèles ont déménagé dans
// /documents/bibliotheque : un modèle sert à FABRIQUER un document, il ne
// s'envoie pas, et les mélanger rendait « mon contrat » ambigu (le modèle,
// ou l'exemplaire signé de M. Benali ?).

const VIDE: Record<DocumentBucket, string> = {
  draft: "Aucun brouillon en cours. Les documents que vous commencez sans les finir se retrouvent ici.",
  final: "Aucun document finalisé en attente d'envoi.",
  sent: "Aucun document envoyé pour le moment.",
  signed: "Aucun document signé pour le moment. Les signatures Yousign arrivent ici automatiquement ; un document signé sur papier s'y ajoute via « Marquer signé ».",
};

export default async function DocumentsPage(props: {
  searchParams: Promise<{ tab?: string; q?: string; category?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none" && can(role, "toolkit") === "none") redirect("/dashboard");

  const activeTab = (DOCUMENT_BUCKETS.find((b) => b.key === searchParams.tab)?.key ?? "draft") as DocumentBucket;
  const q = searchParams.q?.trim();
  const category = searchParams.category;

  // Un formateur ne voit que les documents des dossiers de SES sessions —
  // le filtre imbriqué exclut aussi, au passage, les documents sans dossier
  // (prospect, sous-traitant), ce qui est le comportement voulu.
  const ownerFilter: Prisma.DocumentWhereInput =
    role === Role.TRAINER ? { dossier: { session: { trainerId: userId } } } : {};

  const where: Prisma.DocumentWhereInput = {
    organizationId,
    archivedAt: null,
    ...ownerFilter,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { dossier: { contact: { firstName: { contains: q, mode: "insensitive" } } } },
            { dossier: { contact: { lastName: { contains: q, mode: "insensitive" } } } },
            { contact: { firstName: { contains: q, mode: "insensitive" } } },
            { contact: { lastName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  // Chargé en une fois plutôt qu'en quatre requêtes paginées : le
  // regroupement par lot doit voir TOUS les membres d'un lot pour dire
  // « 5/8 signés », et un lot coupé par une pagination mentirait. Le
  // volume reste celui d'un petit organisme ; si un jour il ne l'est plus,
  // c'est la pagination qui devra se faire par lot, pas par document.
  const rows = await prisma.document.findMany({
    where,
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
      bodyText: true,
      dossier: { select: { contact: { select: { firstName: true, lastName: true } }, session: { select: { course: { select: { title: true } } } } } },
      contact: { select: { firstName: true, lastName: true } },
      subcontractor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 600,
  });

  const canMarkSigned = can(role, "dossiers") !== "none";
  // La signature électronique n'est proposée que si elle est réellement
  // branchée — cocher une case qui ne fait rien serait pire que son absence.
  const signatureAvailable = Boolean(process.env.YOUSIGN_API_KEY);
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
  })) as (BatchMember & { row: Ligne })[];

  const groupes = groupDocuments(members);
  const counts = DOCUMENT_BUCKETS.reduce<Record<string, number>>((acc, b) => {
    acc[b.key] = groupes.filter((g) => g.bucket === b.key).length;
    return acc;
  }, {});

  const affichés: Group[] = groupes
    .filter((g) => g.bucket === activeTab)
    .map((g) => {
      const premier = (g.members[0] as BatchMember & { row: Ligne }).row;
      return {
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
          const r = (m as BatchMember & { row: Ligne }).row;
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
      };
    });

  const TABS = DOCUMENT_BUCKETS.map((b) => ({ key: b.key, label: `${b.label} (${counts[b.key] ?? 0})` }));

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle={DOCUMENT_BUCKETS.find((b) => b.key === activeTab)?.hint}
        action={
          <div className="flex items-center gap-2.5">
            <a
              href="/documents/bibliotheque"
              className="inline-flex items-center border border-line bg-white text-ink text-[13px] font-medium rounded-md px-3.5 py-2 hover:bg-pebble"
            >
              Accéder à ma bibliothèque
            </a>
            <a
              href="/documents/nouveau"
              className="inline-flex items-center bg-ink text-white text-[13px] font-medium rounded-md px-3.5 py-2 hover:bg-ink-soft"
            >
              + Créer un document
            </a>
          </div>
        }
      />
      <Tabs basePath="/documents" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-3xl">
        <div className="flex items-center gap-2.5 flex-wrap">
          <SearchInput placeholder="Rechercher un document ou un destinataire…" />
          <DocumentCategoryFilter />
        </div>
        <DocumentGroupList groups={affichés} emptyLabel={q || category ? "Aucun document ne correspond à cette recherche." : VIDE[activeTab]} />
      </div>
    </>
  );
}

/** Où mène un clic sur un document. */
function hrefDe(m: BatchMember, r: { id: string; bodyText: string | null; templateOrigin: string | null }): string {
  // Le brouillon repart en édition. Sans modèle d'origine — cas qui ne
  // devrait pas exister, les brouillons étant tous créés par
  // /api/documents/draft — on retombe sur la consultation plutôt que de
  // fabriquer une URL qui donnerait un 404.
  if (m.status === "draft" && r.templateOrigin) {
    return `/documents/nouveau/${r.templateOrigin}?doc=${r.id}`;
  }
  return r.bodyText ? `/api/documents/generated/${r.id}` : `/api/documents/${r.id}/file`;
}

type Row = {
  dossier: { contact: { firstName: string; lastName: string }; session: { course: { title: string } } } | null;
  contact: { firstName: string; lastName: string } | null;
  subcontractor: { name: string } | null;
};

/** À qui ce document se rapporte, quel que soit le rattachement utilisé. */
function recipientOf(r: Row): string | null {
  if (r.dossier) return `${r.dossier.contact.firstName} ${r.dossier.contact.lastName}`;
  if (r.contact) return `${r.contact.firstName} ${r.contact.lastName}`;
  if (r.subcontractor) return r.subcontractor.name;
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
