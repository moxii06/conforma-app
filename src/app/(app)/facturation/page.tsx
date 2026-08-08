import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard, EmptyState, FaqHelpLink } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { NewQuoteForm } from "@/components/NewQuoteForm";
import { NewInvoiceForm } from "@/components/NewInvoiceForm";
import { DocStatusSelect, statusLabels, DOC_STATUS_TONE } from "@/components/DocStatusSelect";
import { DocFilterBar } from "@/components/DocFilterBar";
import { SearchInput } from "@/components/SearchInput";
import { Pagination } from "@/components/Pagination";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { CreatePaymentLinkButton } from "@/components/CreatePaymentLinkButton";
import { BankStatementImportDialog } from "@/components/BankStatementImportDialog";
import { BankTransactionReview, BankTransactionRestore } from "@/components/BankTransactionReview";
import { BankConnectionPanel } from "@/components/BankConnectionPanel";
import { isStripeConfigured } from "@/lib/stripe";
import { isBridgeConfigured } from "@/lib/bridge";
import { rankInvoiceMatches, CONFIDENT_MATCH_THRESHOLD } from "@/lib/bankReconciliation";
import { FundersPanel } from "@/components/FundersPanel";
import { FundingPipelinePanel } from "@/components/FundingPipelinePanel";
import { SendFacturationButton } from "@/components/SendFacturationButton";
import { BulkInvoiceStatusButton } from "@/components/BulkInvoiceStatusButton";
import { MAX_FACTURES_PAR_LOT } from "@/lib/bulkLimits";
import { AWAITING_FUNDER, FUNDER_SILENCE_DAYS, AGREEMENT_EXPIRY_WARNING_DAYS } from "@/lib/funding";
import { encaissementFacture, montantEncaisseCents, type Encaissement } from "@/lib/invoiceEncaissement";
import { DocStatus, Prisma } from "@prisma/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function buildOrderBy(sort?: string): Prisma.QuoteOrderByWithRelationInput | Prisma.InvoiceOrderByWithRelationInput {
  switch (sort) {
    case "date_asc":
      return { createdAt: "asc" };
    case "amount_desc":
      return { amountCents: "desc" };
    case "amount_asc":
      return { amountCents: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

// Parses a `?from=`/`?to=` URL param (yyyy-mm-dd, from an <input type="date">)
// into a Date usable in a Prisma `createdAt` range filter — `to` is bumped to
// the end of that calendar day so "01/07 au 31/07" actually includes every
// invoice created on the 31st, not just up to midnight.
function parseDateParam(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Les deux définitions financières de l'écran, écrites UNE fois.
 *
 * La carte du bandeau et la liste sur laquelle elle envoie doivent désigner
 * exactement les mêmes factures. Elles ne le faisaient pas : la carte « En
 * attente de paiement » retirait déjà les factures échues (pour ne pas
 * compter deux fois ce que la carte « En retard » annonce à côté), mais son
 * lien `?status=SENT` retombait sur un `status = SENT` brut. Résultat, sur
 * 5 factures envoyées dont 2 échues : la carte annonçait « 3 factures », le
 * clic en affichait 5, et les 2 échues y portaient la pastille rouge « En
 * retard » tout en étant déjà comptées par la carte voisine.
 *
 * Les deux ensembles sont donc disjoints par construction, et c'est ce qui
 * rend le couple de filtres lisible : « Envoyé » = ce qu'on attend encore,
 * « En retard » = ce qu'on aurait dû recevoir. Ni l'un ni l'autre n'est un
 * simple `status =` : une facture dont l'échéance est passée est en retard
 * même si personne n'a pensé à basculer son statut à la main (même
 * détection que dashboardTasks.ts).
 */
function factureEnRetard(maintenant: Date): Prisma.InvoiceWhereInput {
  return {
    status: { notIn: ["PAID", "DRAFT"] },
    OR: [{ status: "OVERDUE" }, { dueDate: { lt: maintenant } }],
  };
}

function factureEnAttente(maintenant: Date): Prisma.InvoiceWhereInput {
  return { status: "SENT", OR: [{ dueDate: null }, { dueDate: { gte: maintenant } }] };
}

// Trente lignes par page, comme /dossiers. Le nombre importe moins que le
// fait qu'il y en ait un : l'écran chargeait les 8 000 factures de
// l'organisme d'un coup — 22 Mo et treize secondes (audit S7, P1 n°5).
const PAGE_SIZE = 30;

// Le plafond de la liste des transactions « Ignorées ». Elle n'en avait
// aucun, alors qu'une transaction ignorée n'est jamais supprimée : au bout
// d'un an de relevés, l'onglet chargeait tout. Comme le journal d'envois
// d'/automatisations, la liste est bornée ET le dit ; le compteur de
// l'onglet, lui, vient d'un count() et reste exact quel que soit ce plafond.
const MAX_TRANSACTIONS_IGNOREES = 50;

export default async function FacturationPage(
  props: {
    searchParams: Promise<{ tab?: string; status?: string; sort?: string; from?: string; to?: string; ref?: string; q?: string; page?: string; banque?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { organizationId, roles } = await requireSessionContext();
  if (can(roles, "invoicing") === "none") redirect("/dashboard");
  const canWrite = can(roles, "invoicing") !== "none";
  const activeTab = searchParams.tab ?? "devis";
  // Sous-vue de l'onglet « À valider » : par défaut les transactions en
  // attente, ou — sur le même modèle que les emails archivés de la boîte
  // mail — les transactions qu'un membre de l'équipe a marquées « Ignorer ».
  // Paramètre distinct de `status` (qui filtre les DocStatus devis/factures)
  // pour ne jamais faire porter deux sens différents au même nom.
  const bankView = searchParams.banque === "ignorees" ? "ignorees" : "attente";
  // Il n'existe pas de page par facture. Ce paramètre est ce qui donne une
  // destination aux résultats « facture » et « devis » de la recherche
  // globale : isoler la référence cherchée dans la liste, plutôt que d'y
  // déposer l'utilisateur devant deux cents lignes.
  const refFilter = searchParams.ref?.trim() || undefined;
  const statusFilter = searchParams.status && searchParams.status in DocStatus ? (searchParams.status as DocStatus) : undefined;
  const orderBy = buildOrderBy(searchParams.sort);
  const dateFrom = parseDateParam(searchParams.from, false);
  const dateTo = parseDateParam(searchParams.to, true);
  // La recherche libre, elle, part du nom du client ou de l'objet — le
  // filtre `ref` ci-dessus vient de la recherche globale et vise une
  // référence précise, ce n'est pas la même intention.
  const q = searchParams.q?.trim() || undefined;
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  // Le compteur de l'onglet « Prises en charge » : les mêmes deux conditions
  // que commitmentAlert dans lib/funding.ts, mais en base plutôt qu'en
  // mémoire — un simple count, pas le chargement de toutes les lignes. Les
  // seuils viennent des constantes partagées pour que le badge et l'écran ne
  // puissent pas diverger.
  const now = new Date();
  const silenceThreshold = new Date(now.getTime() - FUNDER_SILENCE_DAYS * 86_400_000);
  const expiryThreshold = new Date(now.getTime() + AGREEMENT_EXPIRY_WARNING_DAYS * 86_400_000);

  // Plus de fetch de tous les contacts : le client d'un devis/d'une facture
  // se choisit par recherche serveur dans les formulaires (audit P1). Plus
  // de fetch de tous les dossiers non plus : le dossier lié se cherche
  // maintenant parmi ceux du client choisi (audit S7, P1 n°6) — c'était à
  // lui seul l'essentiel des 22 Mo de cette page.
  const [pendingBankCount, ignoredBankCount, fundingAlertCount, awaitingAgg, overdueAgg, paidAgg] = await Promise.all([
    prisma.bankTransaction.count({ where: { organizationId, status: "pending" } }),
    // Le pendant du compteur « Archivés » de la boîte mail : combien de
    // transactions un membre de l'équipe a marquées « Ignorer » (status
    // dismissed) — jusqu'ici jamais relu nulle part, donc jamais compté ni
    // affiché (voir le commentaire de BankTransaction dans schema.prisma).
    prisma.bankTransaction.count({ where: { organizationId, status: "dismissed" } }),
    prisma.fundingCommitment.count({
      where: {
        organizationId,
        OR: [
          { status: { in: AWAITING_FUNDER }, depositedAt: { lte: silenceThreshold } },
          { status: { in: ["granted", "invoiced"] }, validUntil: { lte: expiryThreshold } },
        ],
      },
    }),
    // Strip totals — "en attente" excludes anything the overdue card counts,
    // so the two never double-comptent une même facture.
    prisma.invoice.aggregate({
      where: { organizationId, status: "SENT", OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }] },
      _sum: { amountCents: true },
      _count: true,
    }),
    // Same auto-detection as the dashboard: dueDate passed counts as late
    // even if staff hasn't flipped the status yet.
    prisma.invoice.aggregate({
      where: { organizationId, status: { notIn: ["PAID", "DRAFT"] }, OR: [{ status: "OVERDUE" }, { dueDate: { lt: new Date() } }] },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.invoice.aggregate({ where: { organizationId, status: "PAID" }, _sum: { amountCents: true } }),
  ]);
  const tabs = [
    { key: "devis", label: "Devis" },
    { key: "factures", label: "Factures" },
    { key: "a-valider", label: pendingBankCount > 0 ? `À valider (${pendingBankCount})` : "À valider" },
    {
      key: "prises-en-charge",
      label: fundingAlertCount > 0 ? `Prises en charge (${fundingAlertCount})` : "Prises en charge",
    },
    { key: "financeurs", label: "Financeurs" },
  ];

  // Loaded only for its own tab: three extra queries on every invoice page
  // view, for a referential most people open twice a year, isn't a trade
  // worth making.
  const funderRows =
    activeTab === "financeurs"
      ? await prisma.funder.findMany({
          where: { organizationId },
          orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
          include: {
            commitments: { select: { amountCents: true, status: true, dossierId: true } },
          },
        })
      : [];

  return (
    <>
      <PageHeader title="Facturation" subtitle="Devis et factures de votre organisme" action={<FaqHelpLink anchor="facturation" />} />
      <Tabs basePath="/facturation" tabs={tabs} active={activeTab} />
      <div className="p-8 flex flex-col gap-4">
        {(activeTab === "devis" || activeTab === "factures") && (
          <div className="flex gap-3.5">
            <MetricCard
              label="En attente de paiement"
              value={formatAmount(awaitingAgg._sum.amountCents ?? 0)}
              hint={awaitingAgg._count > 0 ? `${awaitingAgg._count} facture${awaitingAgg._count > 1 ? "s" : ""}` : undefined}
              href="/facturation?tab=factures&status=SENT"
            />
            <MetricCard
              label="En retard"
              value={formatAmount(overdueAgg._sum.amountCents ?? 0)}
              hint={overdueAgg._count > 0 ? `${overdueAgg._count} facture${overdueAgg._count > 1 ? "s" : ""}` : undefined}
              tone={overdueAgg._count > 0 ? "danger" : "ink"}
              href="/facturation?tab=factures&status=OVERDUE"
            />
            <MetricCard label="Encaissé" value={formatAmount(paidAgg._sum.amountCents ?? 0)} tone="good" href="/facturation?tab=factures&status=PAID" />
            <MetricCard
              label="Rapprochements à valider"
              value={pendingBankCount}
              tone={pendingBankCount > 0 ? "danger" : "ink"}
              href="/facturation?tab=a-valider"
            />
          </div>
        )}
        {activeTab === "financeurs" ? (
          <FundersPanel
            canWrite={canWrite}
            funders={funderRows.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              contactEmail: f.contactEmail,
              contactPhone: f.contactPhone,
              hourlyRateCents: f.hourlyRateCents,
              maxAmountCents: f.maxAmountCents,
              archivedAt: f.archivedAt ? f.archivedAt.toISOString() : null,
              // Distinct dossiers, not commitments: nothing stops two lines
              // from the same funder on one dossier (a top-up, a correction),
              // and the label says "dossier".
              usageCount: new Set(f.commitments.map((c) => c.dossierId)).size,
              // Same rule as computeFundingSummary: only agreed money counts.
              securedCents: f.commitments
                .filter((c) => ["granted", "invoiced", "paid"].includes(c.status))
                .reduce((sum, c) => sum + c.amountCents, 0),
            }))}
          />
        ) : activeTab === "prises-en-charge" ? (
          <FundingPipelineTab organizationId={organizationId} canWrite={canWrite} />
        ) : activeTab === "a-valider" ? (
          canWrite ? (
            <BankValidationTab
              organizationId={organizationId}
              view={bankView}
              pendingCount={pendingBankCount}
              ignoredCount={ignoredBankCount}
            />
          ) : null
        ) : (
          <>
            <div className="flex items-center gap-2.5 flex-wrap">
              <SearchInput placeholder={activeTab === "factures" ? "Rechercher une facture (client, référence, objet)…" : "Rechercher un devis (client, référence, objet)…"} />
              <DocFilterBar />
            </div>
            {refFilter && (
              // Sans ce bandeau, on arrive de la recherche sur une liste à une
              // ligne sans savoir pourquoi les autres ont disparu.
              <div className="flex items-center justify-between gap-3 bg-linen border border-line rounded-card px-4 py-2.5 text-[12.5px] text-ink">
                <span>
                  Filtré sur la référence <span className="font-medium">{refFilter}</span>
                </span>
                <Link href={`/facturation?tab=${activeTab}`} className="text-slate hover:text-ink underline decoration-line">
                  Voir tout
                </Link>
              </div>
            )}
            {activeTab === "factures" ? (
              <InvoicesTab organizationId={organizationId} canWrite={canWrite} statusFilter={statusFilter} orderBy={orderBy} dateFrom={dateFrom} dateTo={dateTo} refFilter={refFilter} q={q} page={page} searchParams={searchParams} />
            ) : (
              <QuotesTab organizationId={organizationId} canWrite={canWrite} statusFilter={statusFilter} orderBy={orderBy} dateFrom={dateFrom} dateTo={dateTo} refFilter={refFilter} q={q} page={page} searchParams={searchParams} />
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * La vue transverse des prises en charge. Les actions (changer un statut,
 * générer la facture au financeur) réutilisent telles quelles les routes par
 * dossier — chaque ligne connaît son dossierId, donc aucune API nouvelle
 * n'était nécessaire, et la logique d'écriture reste à un seul endroit.
 */
async function FundingPipelineTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const [commitments, funders] = await Promise.all([
    prisma.fundingCommitment.findMany({
      where: { organizationId },
      include: {
        funder: { select: { id: true, name: true, type: true, contactEmail: true } },
        invoice: { select: { reference: true } },
        dossier: {
          select: {
            id: true,
            contact: { select: { firstName: true, lastName: true } },
            session: { select: { course: { select: { title: true } } } },
          },
        },
      },
    }),
    prisma.funder.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <FundingPipelinePanel
      canWrite={canWrite}
      funders={funders}
      rows={commitments.map((c) => ({
        id: c.id,
        dossierId: c.dossierId,
        learnerName: `${c.dossier.contact.firstName} ${c.dossier.contact.lastName}`,
        courseTitle: c.dossier.session.course.title,
        funderId: c.funder.id,
        funderName: c.funder.name,
        funderType: c.funder.type,
        funderEmail: c.funder.contactEmail,
        amountCents: c.amountCents,
        subrogation: c.subrogation,
        status: c.status,
        agreementNumber: c.agreementNumber,
        validUntil: c.validUntil?.toISOString() ?? null,
        depositedAt: c.depositedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        invoiceReference: c.invoice?.reference ?? null,
      }))}
    />
  );
}

async function BankValidationTab({
  organizationId,
  view,
  pendingCount,
  ignoredCount,
}: {
  organizationId: string;
  view: "attente" | "ignorees";
  pendingCount: number;
  ignoredCount: number;
}) {
  const connections = isBridgeConfigured()
    ? await prisma.bankConnection.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-slate leading-relaxed max-w-lg">
          Chaque virement reçu ne porte jamais de référence facture fiable — Jalon propose un rapprochement, à valider
          en un clic. Rien n&apos;est jamais associé automatiquement.
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isBridgeConfigured() && (
            <BankConnectionPanel
              connections={connections.map((c) => ({
                id: c.id,
                institutionName: c.institutionName,
                status: c.status,
                lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
              }))}
            />
          )}
          <BankStatementImportDialog />
        </div>
      </div>

      {/* Sous-vue « À valider » / « Ignorées » — même principe que l'onglet
          Archivés de la boîte mail : une transaction ignorée reste
          consultable et réversible (trace d'audit qui/quand), jamais
          supprimée. Voir le commentaire de BankTransaction dans
          schema.prisma. */}
      <div className="flex items-center gap-1 border-b border-line">
        <Link
          href="/facturation?tab=a-valider"
          className={`px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors -mb-px ${
            view === "attente" ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
          }`}
        >
          À valider ({pendingCount})
        </Link>
        <Link
          href="/facturation?tab=a-valider&banque=ignorees"
          className={`px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors -mb-px ${
            view === "ignorees" ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
          }`}
        >
          Ignorées ({ignoredCount})
        </Link>
      </div>

      {view === "ignorees" ? (
        <IgnoredBankTransactions organizationId={organizationId} ignoredCount={ignoredCount} />
      ) : (
        <PendingBankTransactions organizationId={organizationId} />
      )}
    </div>
  );
}

async function PendingBankTransactions({ organizationId }: { organizationId: string }) {
  const [pending, openInvoices] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { organizationId, status: "pending" },
      orderBy: { bookedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: { in: ["SENT", "OVERDUE", "SIGNED"] } },
      // funder inclus : c'est lui qui vire sur une facture subrogée, donc
      // c'est son nom qu'il faut chercher dans le libellé bancaire.
      include: { contact: { include: { company: true } }, payments: true, funder: { select: { name: true } } },
    }),
  ]);

  // Même helper que partout ailleurs (lib/invoiceEncaissement.ts). Ces
  // factures-là sont ouvertes, donc le repli ne joue jamais et le montant est
  // celui d'avant — mais un quatrième `reduce` sur les paiements dans ce
  // fichier, c'est un quatrième endroit où la définition peut dériver.
  const invoiceCandidates = openInvoices.map((inv) => ({
    id: inv.id,
    reference: inv.reference,
    amountCents: inv.amountCents,
    paidCents: montantEncaisseCents(inv),
    createdAt: inv.createdAt,
    contact: { firstName: inv.contact.firstName, lastName: inv.contact.lastName, company: inv.contact.company },
    funder: inv.funder,
  }));
  const invoiceById = new Map(openInvoices.map((inv) => [inv.id, inv]));

  return (
    <div className="flex flex-col gap-2">
      {pending.map((tx) => {
        const ranked = rankInvoiceMatches(
          { amountCents: tx.amountCents, bookedAt: tx.bookedAt, label: tx.label, counterpartyName: tx.counterpartyName },
          invoiceCandidates
        );
        const suggestions = ranked.map((m) => {
          const inv = invoiceById.get(m.invoiceId)!;
          return {
            id: inv.id,
            reference: inv.reference,
            contactName: `${inv.contact.firstName} ${inv.contact.lastName}`,
            remainingCents: encaissementFacture(inv).resteDuCents,
            score: m.score,
            reasons: m.reasons,
          };
        });
        return (
          <BankTransactionReview
            key={tx.id}
            transactionId={tx.id}
            bookedAt={format(tx.bookedAt, "d MMM yyyy", { locale: fr })}
            amountCents={tx.amountCents}
            label={tx.label}
            suggestions={suggestions}
            confident={(ranked[0]?.score ?? 0) >= CONFIDENT_MATCH_THRESHOLD}
          />
        );
      })}
      {pending.length === 0 && (
        <div className="text-[12.5px] text-slate">Aucune transaction en attente — importez un relevé pour commencer.</div>
      )}
    </div>
  );
}

// L'onglet Ignorées : ce que « Ignorer » a mis de côté, sur le même modèle
// que l'onglet Archivés de la boîte mail — consultable (qui, quand) et
// réversible, plutôt qu'un aller sans retour dont l'écran ne montrait même
// pas le résultat.
async function IgnoredBankTransactions({
  organizationId,
  ignoredCount,
}: {
  organizationId: string;
  ignoredCount: number;
}) {
  const dismissed = await prisma.bankTransaction.findMany({
    where: { organizationId, status: "dismissed" },
    orderBy: { reviewedAt: "desc" },
    take: MAX_TRANSACTIONS_IGNOREES,
  });
  const tronquee = ignoredCount > dismissed.length;

  return (
    <div className="flex flex-col gap-2">
      {tronquee && (
        <div className="text-[12px] text-slate">
          Les {MAX_TRANSACTIONS_IGNOREES} plus récentes sur {ignoredCount.toLocaleString("fr-FR")} transactions ignorées.
        </div>
      )}
      {dismissed.map((tx) => (
        <div key={tx.id} className="bg-white border border-line rounded-card px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink truncate">{tx.label}</div>
            <div className="text-[12px] text-slate mt-1">
              {format(tx.bookedAt, "d MMM yyyy", { locale: fr })}
              {tx.reviewedByName && tx.reviewedAt && ` · ignorée par ${tx.reviewedByName} le ${format(tx.reviewedAt, "d MMM yyyy", { locale: fr })}`}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3.5">
            <span className="text-[15px] font-mono tabular-nums text-slate font-semibold">+{formatAmount(tx.amountCents)}</span>
            <BankTransactionRestore transactionId={tx.id} />
          </div>
        </div>
      ))}
      {dismissed.length === 0 && (
        <div className="text-[12.5px] text-slate">Aucune transaction ignorée.</div>
      )}
    </div>
  );
}

/**
 * La recherche libre d'un devis ou d'une facture.
 *
 * Trois entrées possibles, parce que ce sont les trois façons dont on
 * retrouve un document de facturation : par le nom du client, par la
 * référence qu'on a sous les yeux, ou par l'objet de la prestation.
 *
 * Volontairement non annoté d'un type Prisma : devis et factures ont les
 * mêmes champs ici, et une clause écrite deux fois finit toujours par
 * diverger sur l'un des deux écrans.
 */
function rechercheDocument(q: string | undefined) {
  if (!q) return {};
  const mode = "insensitive" as const;
  return {
    OR: [
      { reference: { contains: q, mode } },
      { description: { contains: q, mode } },
      { contact: { firstName: { contains: q, mode } } },
      { contact: { lastName: { contains: q, mode } } },
    ],
  };
}

async function QuotesTab({
  organizationId,
  canWrite,
  statusFilter,
  orderBy,
  dateFrom,
  dateTo,
  refFilter,
  q,
  page,
  searchParams,
}: {
  organizationId: string;
  canWrite: boolean;
  statusFilter?: DocStatus;
  orderBy: Prisma.QuoteOrderByWithRelationInput;
  dateFrom?: Date;
  dateTo?: Date;
  refFilter?: string;
  q?: string;
  page: number;
  searchParams: Record<string, string | undefined>;
}) {
  const where: Prisma.QuoteWhereInput = {
    organizationId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(dateFrom || dateTo ? { createdAt: { gte: dateFrom, lte: dateTo } } : {}),
    ...(refFilter ? { reference: { contains: refFilter, mode: "insensitive" } } : {}),
    ...rechercheDocument(q),
  };
  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: { contact: true },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.quote.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {canWrite ? <NewQuoteForm /> : <span />}
        <div className="text-[12px] text-slate">{total} devis</div>
      </div>
      <div className="flex flex-col gap-2">
        {quotes.map((q) => (
          <div key={q.id} className="bg-white border border-line rounded-card px-5 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink truncate">{q.contact.firstName} {q.contact.lastName}</div>
                <div className="text-[12px] text-slate mt-1.5 truncate">
                  {q.reference} · {formatAmount(q.amountCents)} · {format(q.createdAt, "d MMM yyyy", { locale: fr })}
                  {q.description && ` · ${q.description}`}
                </div>
              </div>
              <div className="shrink-0">
                {canWrite ? <DocStatusSelect kind="quotes" id={q.id} status={q.status} /> : <Pill tone={DOC_STATUS_TONE[q.status]}>{statusLabels("quotes")[q.status]}</Pill>}
              </div>
            </div>
            {canWrite && (
              <div className="flex items-center gap-4 flex-wrap mt-2.5 pt-2.5 border-t border-line">
                <SendFacturationButton
                  kind="quote"
                  id={q.id}
                  reference={q.reference}
                  contactName={`${q.contact.firstName} ${q.contact.lastName}`}
                  hasEmail={Boolean(q.contact.email)}
                />
              </div>
            )}
          </div>
        ))}
        {quotes.length === 0 &&
          (q ? (
            <div className="text-[12.5px] text-slate">Aucun devis ne correspond à cette recherche.</div>
          ) : (
            <EmptyState
              title="Aucun devis enregistré"
              description={
                canWrite
                  ? "Un devis envoyé ici met automatiquement à jour l'étape du prospect dans le CRM — créez le premier avec le formulaire ci-dessus."
                  : "Aucun devis n'a encore été créé."
              }
            />
          ))}
      </div>
      <Pagination basePath="/facturation" searchParams={searchParams} page={page} totalPages={totalPages} />
    </div>
  );
}

async function InvoicesTab({
  organizationId,
  canWrite,
  statusFilter,
  orderBy,
  dateFrom,
  dateTo,
  refFilter,
  q,
  page,
  searchParams,
}: {
  organizationId: string;
  canWrite: boolean;
  statusFilter?: DocStatus;
  orderBy: Prisma.InvoiceOrderByWithRelationInput;
  dateFrom?: Date;
  dateTo?: Date;
  refFilter?: string;
  q?: string;
  page: number;
  searchParams: Record<string, string | undefined>;
}) {
  // Le filtre « en retard » et la recherche libre posent tous deux un OR :
  // les juxtaposer à la racine ferait que l'un écrase l'autre en silence.
  // AND les garde indépendants — « en retard » ET « qui parle de Dupont ».
  const conditions: Prisma.InvoiceWhereInput[] = [];
  // "En retard" (from DocFilterBar or the dashboard's "Factures en retard"
  // card) means the same auto-detected set as dashboardTasks.ts and the
  // dashboard total, not a strict status match — otherwise an invoice
  // overdue by dueDate but still status SENT would show in the dashboard
  // count but vanish from this filtered list.
  if (statusFilter === "OVERDUE") {
    conditions.push({ status: { notIn: ["PAID", "DRAFT"] }, OR: [{ status: "OVERDUE" }, { dueDate: { lt: new Date() } }] });
  } else if (statusFilter) {
    conditions.push({ status: statusFilter });
  }
  if (q) conditions.push(rechercheDocument(q));

  const where: Prisma.InvoiceWhereInput = {
    organizationId,
    ...(dateFrom || dateTo ? { createdAt: { gte: dateFrom, lte: dateTo } } : {}),
    ...(refFilter ? { reference: { contains: refFilter, mode: "insensitive" } } : {}),
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };
  const [invoices, total, candidatesLot, stripeConfigured] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { contact: true, payments: true },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
    // Le lot suit le FILTRE, pas la page affichée : on isole des factures
    // avec la recherche ou le statut, puis on applique. Requête à part et
    // volontairement légère — quatre colonnes, plafonnée au maximum que la
    // route accepte.
    canWrite
      ? prisma.invoice.findMany({
          where,
          select: { id: true, reference: true, amountCents: true, contact: { select: { firstName: true, lastName: true } } },
          orderBy,
          take: MAX_FACTURES_PAR_LOT,
        })
      : Promise.resolve([]),
    isStripeConfigured(organizationId),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cibles = candidatesLot.map((i) => ({
    id: i.id,
    libelle: `${i.reference} — ${i.contact.firstName} ${i.contact.lastName}`,
    detail: formatAmount(i.amountCents),
  }));
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {canWrite && <NewInvoiceForm />}
          {/* Actions de masse (audit S7, P2). Elles portent sur l'ensemble
              filtré et nomment chaque facture avant d'agir. */}
          {canWrite && candidatesLot.length > 0 && (
            <>
              <BulkInvoiceStatusButton cibles={cibles} total={total} statut={DocStatus.PAID} />
              <BulkInvoiceStatusButton cibles={cibles} total={total} statut={DocStatus.SENT} />
            </>
          )}
        </div>
        <div className="text-[12px] text-slate">
          {total} facture{total > 1 ? "s" : ""}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {invoices.map((inv) => {
          // La seule définition de « encaissé » de l'application (voir
          // lib/invoiceEncaissement.ts) — la fiche contact lit la même, donc
          // les deux écrans ne peuvent plus annoncer deux montants.
          const encaissement = encaissementFacture(inv);
          // Computed live so a passed due date reads as overdue immediately,
          // without staff needing to remember to flip status to OVERDUE by
          // hand — see dashboardTasks.ts, which now detects the same thing.
          const isOverdue = inv.status !== "PAID" && inv.status !== "DRAFT" && (inv.status === "OVERDUE" || (inv.dueDate !== null && inv.dueDate < now));
          return (
            <div key={inv.id} className="bg-white border border-line rounded-card px-5 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink truncate">{inv.contact.firstName} {inv.contact.lastName}</div>
                  <div className="text-[12px] text-slate mt-1.5 truncate">
                    {inv.reference} · {formatAmount(inv.amountCents)}
                    {inv.dueDate && ` · éch. ${format(inv.dueDate, "d MMM yyyy", { locale: fr })}`}
                    {inv.description && ` · ${inv.description}`}
                    {/* Le canal de transmission N'EST PAS affiché ici.
                        einvoicingProvider n'enregistre qu'une intention :
                        aucun connecteur n'émet réellement vers le portail
                        public. Afficher « · PPF » à côté d'une facture se
                        lisait comme « celle-ci est partie par le PPF », ce
                        qui était faux — et sur de la facturation, une
                        fausse confirmation coûte plus cher qu'une absence
                        d'information. */}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {isOverdue && inv.status !== "OVERDUE" && <Pill tone="danger">En retard</Pill>}
                  {canWrite ? <DocStatusSelect kind="invoices" id={inv.id} status={inv.status} /> : <Pill tone={DOC_STATUS_TONE[inv.status]}>{statusLabels("invoices")[inv.status]}</Pill>}
                </div>
              </div>
              {canWrite && (
                <div className="flex items-center gap-4 flex-wrap mt-2.5 pt-2.5 border-t border-line">
                  <SendFacturationButton
                    kind="invoice"
                    id={inv.id}
                    reference={inv.reference}
                    contactName={`${inv.contact.firstName} ${inv.contact.lastName}`}
                    hasEmail={Boolean(inv.contact.email)}
                  />
                  {/* Encaissement : seulement une fois la facture partie —
                      enregistrer un règlement sur un brouillon n'a pas de sens.
                      Une fois PAID, le bloc reste AFFICHÉ mais en lecture
                      seule. Le masquer entièrement avait deux effets non
                      voulus : une facture soldée normalement n'indiquait plus
                      du tout ce qu'elle avait encaissé, et une facture marquée
                      payée à la main alors qu'il restait 400 € sur 1 000 €
                      masquait ce solde au lieu de le signaler — exactement
                      l'information qu'un comptable vient chercher ici. Ce qui
                      disparaît, et à raison : « Enregistrer un paiement » et le
                      lien Stripe, puisqu'une facture déclarée payée n'attend
                      plus d'argent. */}
                  {inv.status === "PAID" ? (
                    <EncaissementLectureSeule amountCents={inv.amountCents} encaissement={encaissement} />
                  ) : (
                    inv.status !== "DRAFT" && (
                      <>
                        <RecordPaymentForm
                          invoiceId={inv.id}
                          amountCents={inv.amountCents}
                          totalPaidCents={encaissement.encaisseCents}
                        />
                        {stripeConfigured && <CreatePaymentLinkButton invoiceId={inv.id} />}
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        {invoices.length === 0 &&
          (q ? (
            <div className="text-[12.5px] text-slate">Aucune facture ne correspond à cette recherche.</div>
          ) : (
            <EmptyState
              title="Aucune facture enregistrée"
              description={
                canWrite
                  ? "Une facture réglée se rapproche automatiquement de votre relevé bancaire si vous l'avez connecté — créez la première avec le formulaire ci-dessus."
                  : "Aucune facture n'a encore été créée."
              }
            />
          ))}
      </div>
      <Pagination basePath="/facturation" searchParams={searchParams} page={page} totalPages={totalPages} />
    </div>
  );
}

/**
 * L'encaissement d'une facture déjà marquée « Payé », en lecture seule.
 *
 * Même barre et même phrase « X / Y payés » que RecordPaymentForm, privées
 * du bouton et du lien Stripe : ce qu'on vient vérifier sur une facture
 * soldée, c'est le montant, pas un moyen d'en saisir un de plus.
 *
 * Les trois mentions ne se ressemblent pas par hasard :
 *  - « soldée en la marquant payée » nomme le règlement qu'a écrit le
 *    sélecteur de statut, donc celui qui se défera si la facture repasse en
 *    « Envoyé ». La marque posée par lib/invoiceEncaissement.ts n'a d'intérêt
 *    que si elle se lit ailleurs que dans la base ;
 *  - « aucun règlement enregistré » dit franchement que le montant est déduit
 *    du statut : c'est une facture d'avant le suivi des règlements, pas une
 *    ligne du grand livre ;
 *  - l'écart, lui, est écrit en toutes lettres. Une facture marquée payée
 *    avec 400 € encaissés sur 1 000 € n'en disait rien du tout ; c'est
 *    précisément ce qu'un comptable vient chercher.
 */
function EncaissementLectureSeule({
  amountCents,
  encaissement,
}: {
  amountCents: number;
  encaissement: Encaissement;
}) {
  const pct = amountCents > 0 ? Math.min(100, Math.round((encaissement.encaisseCents / amountCents) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="h-1.5 flex-1 min-w-[80px] max-w-[160px] bg-pebble rounded-full overflow-hidden">
          <div
            className={`h-full ${encaissement.resteDuMalgrePaye ? "bg-rust" : "bg-sage"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11.5px] text-slate">
          {formatAmount(encaissement.encaisseCents)} / {formatAmount(amountCents)} payés
        </span>
        {encaissement.soldeAutomatique && <span className="text-[11.5px] text-slate">· soldée en la marquant payée</span>}
        {encaissement.deduitDuStatut && (
          <span className="text-[11.5px] text-slate">· montant déduit du statut, aucun règlement enregistré</span>
        )}
      </div>
      {encaissement.resteDuMalgrePaye && (
        <div className="text-[11.5px] text-rust">
          Marquée payée alors que {formatAmount(encaissement.resteDuCents)}{" "}
          n&apos;ont jamais été encaissés. Repassez-la en « Envoyé » pour enregistrer le règlement manquant.
        </div>
      )}
    </div>
  );
}
