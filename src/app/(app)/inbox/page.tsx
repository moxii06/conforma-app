import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Button } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, can, canWriteRgpd } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { InboxTriageSplitView } from "@/components/InboxTriageSplitView";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";
import { MailboxActions } from "@/components/MailboxActions";
import { MailboxFilterSelect } from "@/components/MailboxFilterSelect";
import { RgpdSuggestionActions } from "@/components/RgpdSuggestionActions";
import { InboxDossierSuggestionActions } from "@/components/InboxDossierSuggestionActions";
import { InboxRestoreButton } from "@/components/InboxArchiveActions";
import { Pagination } from "@/components/Pagination";
import { Role } from "@prisma/client";

const RGPD_REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Accès",
  erasure: "Effacement",
  portability: "Portabilité",
  rectification: "Rectification",
};

// Trente messages par page. Le triage se fait de toute façon un message à
// la fois : ce qui manquait, c'était de ne plus tous les charger — 20 000
// emails en base, 5,7 Mo envoyés au navigateur (audit S7, P1 n°5).
const PAGE_SIZE = 30;
// La liste RGPD est repliée et se traite à l'unité. On en montre les vingt
// plus récentes ET on affiche le total réel juste à côté : la demande la
// plus ancienne est celle dont le délai d'un mois expire en premier, elle
// ne doit pas disparaître sans qu'on le dise.
const RGPD_APERCU = 20;

export default async function InboxPage(props: { searchParams: Promise<{ mailbox?: string; tab?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "inbox") === "none") redirect("/dashboard");
  const canWrite = can(role, "inbox") !== "none";
  const canHandleRgpd = canWriteRgpd(role);
  // L'onglet « RGPD » a été fusionné dans le triage (audit P1 : « est-ce que
  // l'onglet RGPD est vraiment nécessaire ? »). Un lien ou un signet qui
  // pointe encore dessus retombe sur le triage, où le bandeau se trouve
  // désormais, plutôt que sur un onglet vide.
  const activeTab =
    searchParams.tab === "rattachements" ? "rattachements" : searchParams.tab === "archives" ? "archives" : "a-trier";

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  // Plus de chargement de tous les contacts : « rattacher à un contact
  // existant » passe par la recherche serveur (ContactSearchInput), comme
  // partout ailleurs. À 4 000 apprenants, cette seule requête versait toute
  // la base dans la page de triage.
  const [connections, members, sender, courses] = await Promise.all([
    prisma.mailboxConnection.findMany({ where: { organizationId }, orderBy: { connectedAt: "asc" } }),
    prisma.user.findMany({
      where: { organizationId, status: "active", role: { not: Role.LEARNER } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, emailSignature: true } }),
    // Pour le champ « formation visée » du nouveau prospect, mêmes options
    // que côté CRM.
    prisma.course.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);
  const signatureHtml = sender.emailSignature ?? `Cordialement,<br>${sender.name}`;

  const mailboxFilter =
    searchParams.mailbox && connections.some((c) => c.id === searchParams.mailbox) ? searchParams.mailbox : undefined;

  const unsortedWhere = {
    organizationId,
    contactId: null,
    ignoredAt: null,
    // A reply sent from this screen before the message is linked to a
    // contact (see InboxReplyDialog) creates its own "out" EmailMessage
    // row with the same null contactId — without this it would show up
    // here needing triage (Nouveau prospect/Rattacher/Ignorer) on
    // staff's own sent message.
    direction: { not: "out" },
    ...(mailboxFilter ? { mailboxConnectionId: mailboxFilter } : {}),
  };
  const suggestedWhere = {
    organizationId,
    contactId: { not: null },
    suggestedDossierId: { not: null },
    ...(mailboxFilter ? { mailboxConnectionId: mailboxFilter } : {}),
  };
  const rgpdWhere = { organizationId, rgpdSuggestedType: { not: null } };
  // Ce que « Archiver » (ex-Ignorer) a mis de côté — consultable et
  // réversible, plutôt qu'un aller sans retour dont l'écran ne montrait
  // même pas le résultat.
  const archivedWhere = {
    organizationId,
    ignoredAt: { not: null },
    ...(mailboxFilter ? { mailboxConnectionId: mailboxFilter } : {}),
  };

  // Les compteurs d'onglets viennent d'un `count`, plus de la longueur de la
  // liste chargée : depuis qu'elle est paginée, « À trier (30) » aurait été
  // faux à chaque fois qu'il y en a plus de trente.
  const [unsorted, unsortedCount, suggested, suggestedCount, archived, archivedCount, rgpdSuggested, rgpdCount] = await Promise.all([
    prisma.emailMessage.findMany({
      where: unsortedWhere,
      include: { attachments: { orderBy: { createdAt: "asc" } } },
      orderBy: { receivedAt: "desc" },
      skip: activeTab === "a-trier" ? (page - 1) * PAGE_SIZE : 0,
      take: PAGE_SIZE,
    }),
    prisma.emailMessage.count({ where: unsortedWhere }),
    prisma.emailMessage.findMany({
      where: suggestedWhere,
      include: { contact: true },
      orderBy: { receivedAt: "desc" },
      skip: activeTab === "rattachements" ? (page - 1) * PAGE_SIZE : 0,
      take: PAGE_SIZE,
    }),
    prisma.emailMessage.count({ where: suggestedWhere }),
    prisma.emailMessage.findMany({
      where: archivedWhere,
      include: { contact: true },
      orderBy: { receivedAt: "desc" },
      skip: activeTab === "archives" ? (page - 1) * PAGE_SIZE : 0,
      take: PAGE_SIZE,
    }),
    prisma.emailMessage.count({ where: archivedWhere }),
    canHandleRgpd
      ? prisma.emailMessage.findMany({
          where: rgpdWhere,
          include: { contact: true },
          orderBy: { receivedAt: "desc" },
          take: RGPD_APERCU,
        })
      : Promise.resolve([]),
    canHandleRgpd ? prisma.emailMessage.count({ where: rgpdWhere }) : Promise.resolve(0),
  ]);

  // Le libellé du dossier suggéré — sans lui, l'onglet Rattachements
  // montrait un contact et une date, jamais VERS QUOI le rattachement se
  // proposait. suggestedDossierId est un identifiant nu, sans relation
  // Prisma dédiée (voir le commentaire du schéma) : une seconde requête,
  // bornée à la page affichée.
  const dossierIds = [...new Set(suggested.map((m) => m.suggestedDossierId).filter((id): id is string => !!id))];
  const suggestedDossiers = dossierIds.length
    ? await prisma.dossier.findMany({
        where: { id: { in: dossierIds }, organizationId },
        select: { id: true, session: { select: { course: { select: { title: true } } } } },
      })
    : [];
  const dossierLabelById = new Map(suggestedDossiers.map((d) => [d.id, d.session.course.title]));

  const tabs = [
    { key: "a-trier", label: `À trier (${unsortedCount})` },
    { key: "rattachements", label: `Rattachements (${suggestedCount})` },
    { key: "archives", label: `Archivés (${archivedCount})` },
  ];
  const totalPages = Math.max(
    1,
    Math.ceil(
      (activeTab === "rattachements" ? suggestedCount : activeTab === "archives" ? archivedCount : unsortedCount) /
        PAGE_SIZE
    )
  );

  // Sans boîte connectée ET sans le moindre email, l'écran de triage est une
  // pièce vide : trois onglets à zéro, un filtre par boîte qui n'a rien à
  // filtrer, et un bandeau qui annonçait des « emails de démonstration
  // ci-dessous » qu'un organisme réel n'a jamais eus. On explique plutôt ce
  // que la connexion apporte, une fois. Le jeu de démo, lui, a des emails
  // sans connexion : il continue de montrer le triage, ce qui est le but.
  if (connections.length === 0 && unsortedCount + suggestedCount + archivedCount + rgpdCount === 0) {
    const peutConnecter = can(role, "integrations") === "full";
    return (
      <>
        <PageHeader title="Boîte mail" subtitle="Triage des emails entrants" />
        <div className="p-8 max-w-xl">
          <div className="bg-white border border-line rounded-card p-6 flex flex-col gap-4">
            <div>
              <div className="text-[14px] font-semibold text-ink mb-1">Aucune boîte mail connectée</div>
              <div className="text-[12.5px] text-slate leading-relaxed">
                Jalon ne lit rien tant que vous n&apos;avez pas connecté une adresse. Une fois connectée, chaque email
                entrant est rapproché du bon dossier, et vous répondez sans quitter la fiche du client.
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink">
              <li className="flex gap-2">
                <span className="text-sage shrink-0">·</span>
                Les échanges se rangent tout seuls dans le dossier de l&apos;apprenant — c&apos;est la trace qu&apos;un
                auditeur demande.
              </li>
              <li className="flex gap-2">
                <span className="text-sage shrink-0">·</span>
                Une demande RGPD noyée dans le flot est repérée à l&apos;arrivée : le délai légal est d&apos;un mois, et
                il court à partir de la réception, pas de la découverte.
              </li>
              <li className="flex gap-2">
                <span className="text-sage shrink-0">·</span>
                Gmail, ou n&apos;importe quelle adresse en IMAP/SMTP — y compris celle de votre nom de domaine.
              </li>
            </ul>
            {peutConnecter ? (
              <Button href="/integrations" className="self-start">
                Connecter une boîte mail
              </Button>
            ) : (
              <div className="text-[12px] text-slate border-t border-line pt-3">
                Seul le titulaire du compte peut connecter une boîte mail, depuis Intégrations.
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Boîte mail" subtitle="Triage des emails entrants" />
      <Tabs basePath="/inbox" tabs={tabs} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-3xl">
        <div className="pb-4 border-b border-line">
          {connections.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full bg-ash shrink-0" />
              <span className="text-slate">
                Aucune boîte connectée — les emails ci-dessous ne se mettront plus à jour.
              </span>
              <Link href="/integrations" className="text-ink font-medium underline decoration-line hover:decoration-ink">
                Connecter une boîte →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage shrink-0" />
                  <span className="text-ink font-medium">
                    {c.provider} — {c.accountEmail}
                  </span>
                  {(c.provider === "gmail" || c.provider === "imap") && canWrite && (
                    <MailboxActions provider={c.provider} connectionId={c.id} syncEnabled={c.syncEnabled} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {activeTab === "rattachements" ? (
          suggested.length > 0 ? (
            <div className="bg-white border border-line rounded-card p-4">
              {suggested.map((m) => (
                <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[12.5px] text-ink font-medium">
                      {m.contact?.firstName} {m.contact?.lastName} — {m.subject}
                    </div>
                    <div className="text-[11.5px] text-slate mt-0.5">
                      {format(m.receivedAt, "d MMM yyyy", { locale: fr })}
                      {m.suggestedDossierId && (
                        <>
                          {" · vers "}
                          <span className="text-ink font-medium">
                            {dossierLabelById.get(m.suggestedDossierId) ?? "dossier inconnu"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Pill tone="neutral">{m.matchBasis === "thread" ? "Suggéré par fil de discussion" : "Suggéré par référence"}</Pill>
                    {canWrite && (
                      <AssignEmailSelect messageId={m.id} members={members} assignedToUserId={m.assignedToUserId} />
                    )}
                    {canWrite && <InboxDossierSuggestionActions messageId={m.id} />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-slate">Aucune suggestion en attente.</div>
          )
        ) : activeTab === "archives" ? (
          archived.length > 0 ? (
            <div className="bg-white border border-line rounded-card p-4">
              {archived.map((m) => (
                <div key={m.id} className="py-3 border-t border-line first:border-t-0 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[12.5px] text-ink font-medium">
                      {m.contact ? `${m.contact.firstName} ${m.contact.lastName}` : m.fromName || m.fromAddress} — {m.subject}
                    </div>
                    <div className="text-[11.5px] text-slate mt-0.5">{format(m.receivedAt, "d MMM yyyy", { locale: fr })}</div>
                  </div>
                  {canWrite && <InboxRestoreButton messageId={m.id} />}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-slate">Aucun message archivé.</div>
          )
        ) : (
          <>
            <div className="flex justify-end">
              <MailboxFilterSelect connections={connections.map((c) => ({ id: c.id, provider: c.provider, accountEmail: c.accountEmail }))} />
            </div>

            {/* Ex-onglet RGPD, désormais replié au-dessus du triage : un
                organisme croise une demande de droits quelques fois par an,
                un onglet permanent à zéro pour ça était disproportionné.
                Replié, il ne coûte qu'une ligne ; il ne s'affiche pas du
                tout quand il n'y a rien — mais le délai légal d'un mois
                court dès la réception, donc il reste sur le chemin du
                triage quotidien plutôt que dans un écran qu'on n'ouvre pas. */}
            {canHandleRgpd && rgpdSuggested.length > 0 && (
              <details className="bg-white border border-rust/30 rounded-card px-4 py-3">
                <summary className="cursor-pointer text-[12.5px] text-ink marker:text-rust">
                  <span className="font-medium">
                    {rgpdCount} demande{rgpdCount > 1 ? "s" : ""} RGPD possible
                    {rgpdCount > 1 ? "s" : ""}
                  </span>
                  <span className="text-slate"> — détectée{rgpdCount > 1 ? "s" : ""} à la synchronisation, à vérifier (délai légal : 1 mois à compter de la réception)</span>
                </summary>
                <div className="mt-2 border-t border-line">
                  {/* Dire ce qu'on ne montre pas : une liste tronquée en
                      silence sur un sujet à délai légal serait pire que pas
                      de liste du tout. */}
                  {rgpdCount > rgpdSuggested.length && (
                    <div className="py-2 text-[11.5px] text-slate">
                      Les {rgpdSuggested.length} plus récentes sont affichées ci-dessous, sur {rgpdCount} au total.
                    </div>
                  )}
                  {rgpdSuggested.map((m) => (
                    <div key={m.id} className="py-3 border-t border-line first:border-t-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12.5px] text-ink font-medium">
                          {m.fromName ? `${m.fromName} — ${m.fromAddress}` : m.fromAddress}
                        </div>
                        <Pill tone="danger">{RGPD_REQUEST_TYPE_LABELS[m.rgpdSuggestedType!] ?? m.rgpdSuggestedType}</Pill>
                      </div>
                      <div className="text-[12.5px] text-ink mt-0.5">{m.subject}</div>
                      {m.rgpdReasoning && <div className="text-[12px] text-slate mt-0.5">{m.rgpdReasoning}</div>}
                      <RgpdSuggestionActions
                        messageId={m.id}
                        suggestedType={m.rgpdSuggestedType as "access" | "erasure" | "portability" | "rectification"}
                        defaultPersonLabel={m.contact ? `${m.contact.firstName} ${m.contact.lastName}` : m.fromName || m.fromAddress}
                      />
                    </div>
                  ))}
                </div>
              </details>
            )}

            {unsorted.length > 0 ? (
              <InboxTriageSplitView
                messages={unsorted}
                members={members}
                courses={courses}
                canWrite={canWrite}
                signatureHtml={signatureHtml}
              />
            ) : (
              <div className="text-[12.5px] text-slate">Rien à trier.</div>
            )}
          </>
        )}
        <Pagination
          basePath="/inbox"
          searchParams={{ tab: searchParams.tab, mailbox: searchParams.mailbox, page: searchParams.page }}
          page={page}
          totalPages={totalPages}
        />
      </div>
    </>
  );
}
