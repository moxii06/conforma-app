import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, MetricCard, EmptyState, Button } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { requireSessionContext, canWriteRgpd, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { type Prisma } from "@prisma/client";
import { SearchInput } from "@/components/SearchInput";
import { Pagination } from "@/components/Pagination";
import { RgpdClotureDossierButton } from "@/components/RgpdClotureDossierButton";
import { TYPE_DEMANDE_ACCES_INTERNE } from "@/lib/rgpdMasking";
import {
  STATUT_CONSERVATION_LABELS,
  dateObtention,
  echeanceConservation,
  statutConservation,
  traitementConcerneApprenants,
  type StatutConservation,
} from "@/lib/rgpdRetention";
import { AddProcessingActivityForm } from "@/components/AddProcessingActivityForm";
import { ProcessingActivityControls } from "@/components/ProcessingActivityControls";
import { InstallStarterRegisterButton } from "@/components/InstallStarterRegisterButton";
import { labelForLegalBasis } from "@/lib/rgpdLegalBases";
import { AddDpiaForm } from "@/components/AddDpiaForm";
import { DpiaControls } from "@/components/DpiaControls";
import { AddSubProcessorForm } from "@/components/AddSubProcessorForm";
import { SubProcessorControls } from "@/components/SubProcessorControls";
import { AddRightsRequestForm } from "@/components/AddRightsRequestForm";
import { RightsRequestControls } from "@/components/RightsRequestControls";
import { AddDataBreachDialog } from "@/components/AddDataBreachDialog";
import { DataBreachControls } from "@/components/DataBreachControls";
import { LibraryPanel } from "@/components/LibraryPanel";
import { format, differenceInHours } from "date-fns";
import { fr } from "date-fns/locale";

const TABS = [
  { key: "registre", label: "Registre des traitements" },
  // Juste après le registre parce que c'est sa LECTURE, pas un module de
  // plus : mêmes lignes, croisées avec les dossiers réels.
  { key: "suivi-apprenant", label: "Suivi par apprenant" },
  { key: "dpia", label: "DPIA / AIPD" },
  { key: "sous-traitants", label: "Sous-traitants & DPA" },
  { key: "droits", label: "Demandes de droits" },
  { key: "violations", label: "Violations de données" },
];

/** Dossiers par page. Chacun se déplie en autant de lignes qu'il a de traitements applicables. */
const PAGE_SIZE_SUIVI = 10;

const BREACH_STATUS_LABELS: Record<string, string> = { investigating: "En cours d'analyse", contained: "Maîtrisée", closed: "Clôturée" };
const BREACH_SEVERITY_LABELS: Record<string, string> = { low: "Faible", moderate: "Modérée", high: "Élevée" };

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Accès",
  erasure: "Effacement",
  portability: "Portabilité",
  rectification: "Rectification",
  // Demande INTERNE d'un intervenant dont on a masqué les coordonnées d'un
  // apprenant — pas un droit exercé par la personne concernée. Nommée
  // distinctement pour qu'un auditeur ne lise pas quarante demandes d'accès
  // là où il n'y a que des formateurs cherchant un numéro de téléphone.
  [TYPE_DEMANDE_ACCES_INTERNE]: "Accès interne (intervenant)",
};

const STATUT_CONSERVATION_TONE: Record<StatutConservation, "good" | "warn" | "danger"> = {
  actif: "good",
  proche: "warn",
  echu: "danger",
};

const STATUS_LABELS: Record<string, string> = { open: "Ouverte", in_progress: "En cours", closed: "Clôturée" };
const RISK_LEVEL_LABELS: Record<string, string> = { low: "Faible", moderate: "Modéré", high: "Élevé" };
const DPIA_STATUS_LABELS: Record<string, string> = {
  required: "Requise",
  in_progress: "En cours",
  validated: "Validée",
  not_required: "Non requise",
};

export default async function RgpdPage(props: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await requireSessionContext();
  if (can(session.roles, "rgpd") === "none") redirect("/dashboard");
  const activeTab = searchParams.tab ?? "registre";
  const canWrite = canWriteRgpd(session.roles);
  // Clôturer un dossier n'est PAS une permission RGPD : c'est la même que
  // partout ailleurs dans Jalon (voir /api/dossiers/archive), sinon le DPO
  // externe — lecteur du registre — pourrait fermer des dossiers.
  const peutClore = can(session.roles, "dossiers") === "full";

  // The one legally time-bound thing on this page: a rights request has a
  // hard RGPD deadline — surfaced as a number, not buried in a tab.
  const [openRequests, overdueRequests, openBreaches, activityCount] = await Promise.all([
    prisma.rightsRequest.count({ where: { organizationId: session.organizationId, status: { not: "closed" } } }),
    prisma.rightsRequest.count({
      where: { organizationId: session.organizationId, status: { not: "closed" }, deadline: { lt: new Date() } },
    }),
    prisma.dataBreach.count({ where: { organizationId: session.organizationId, status: { not: "closed" } } }),
    prisma.processingActivity.count({ where: { organizationId: session.organizationId } }),
  ]);

  return (
    <>
      <PageHeader
        title="Registre RGPD"
        subtitle="Documentation et preuves de conformité"
        action={<LibraryPanel variant="button" label="Bibliothèque de documents" />}
      />
      <Tabs basePath="/rgpd" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4">
        <div className="flex gap-3.5">
          <MetricCard
            label="Demandes de droits ouvertes"
            value={openRequests}
            hint={overdueRequests > 0 ? `${overdueRequests} au-delà du délai légal d'un mois` : undefined}
            tone={overdueRequests > 0 ? "danger" : "ink"}
            href="/rgpd?tab=droits"
          />
          <MetricCard
            label="Violations en cours"
            value={openBreaches}
            tone={openBreaches > 0 ? "danger" : "ink"}
            href="/rgpd?tab=violations"
          />
          <MetricCard label="Traitements au registre" value={activityCount} href="/rgpd?tab=registre" />
        </div>
        {activeTab === "suivi-apprenant" ? (
          <SuiviApprenantTab
            organizationId={session.organizationId}
            q={searchParams.q?.trim() || undefined}
            page={Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1)}
            rawPage={searchParams.page}
            peutClore={peutClore}
          />
        ) : activeTab === "dpia" ? (
          <DpiaTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : activeTab === "sous-traitants" ? (
          <SubProcessorsTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : activeTab === "droits" ? (
          <RightsRequestsTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : activeTab === "violations" ? (
          <DataBreachesTab organizationId={session.organizationId} canWrite={canWrite} />
        ) : (
          <RegisterTab organizationId={session.organizationId} canWrite={canWrite} />
        )}
      </div>
    </>
  );
}

async function RegisterTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const activities = await prisma.processingActivity.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  // Un registre vide n'est pas un écran en attente de saisie : c'est une
  // non-conformité à l'article 30. Et les traitements d'un organisme de
  // formation sont, à peu de chose près, toujours les mêmes — d'où une
  // proposition concrète plutôt qu'une ligne « Aucun traitement enregistré »
  // au-dessus d'un formulaire vide.
  if (activities.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card p-6 flex flex-col gap-4 max-w-2xl">
        <div>
          <div className="text-[14px] font-semibold text-ink mb-1">Votre registre des traitements est vide</div>
          <div className="text-[12.5px] text-slate leading-relaxed">
            L&apos;article 30 du RGPD impose de tenir la liste de ce que vous faites des données personnelles. C&apos;est
            la première pièce demandée en cas de contrôle, et la seule qui ne se reconstitue pas après coup.
          </div>
        </div>
        {canWrite ? (
          <>
            <InstallStarterRegisterButton />
            <div className="text-[12px] text-slate border-t border-line pt-3.5">
              Ou saisissez le premier traitement à la main :
            </div>
            <AddProcessingActivityForm />
          </>
        ) : (
          <div className="text-[12px] text-slate border-t border-line pt-3">
            Votre rôle ne permet pas de modifier le registre.
          </div>
        )}
      </div>
    );
  }

  const incomplets = activities.filter((a) => !a.purpose || !a.dataSubjects || !a.dataCategories).length;

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <div className="text-[13.5px] font-semibold text-ink">Registre des traitements</div>
        {incomplets > 0 && (
          // Les lignes créées avant que le registre ne couvre l'article 30
          // n'ont ni finalité ni catégories. Les laisser passer pour
          // complètes serait le plus sûr moyen de le découvrir en contrôle.
          <span className="text-[11.5px] text-rust">
            {incomplets} traitement{incomplets > 1 ? "s" : ""} à compléter (finalité, personnes, données)
          </span>
        )}
      </div>
      <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[2]">Traitement</div>
        <div className="flex-[1.4]">Base légale</div>
        <div className="flex-1">Conservation</div>
        <div className={canWrite ? "flex-[1.6]" : "flex-[0.6]"}>Statut</div>
      </div>
      {activities.map((a) => (
        <div key={a.id} className="text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
          <div className="flex items-center">
            <div className="flex-[2]">{a.name}</div>
            <div className="flex-[1.4] text-slate">{labelForLegalBasis(a.legalBasis)}</div>
            <div className="flex-1 text-slate">{a.retentionPeriod}</div>
            <div className={canWrite ? "flex-[1.6]" : "flex-[0.6]"}>
              {canWrite ? (
                <ProcessingActivityControls activityId={a.id} name={a.name} riskFlag={a.riskFlag} />
              ) : (
                <Pill tone={a.riskFlag === "ok" ? "good" : "warn"}>{a.riskFlag === "ok" ? "À jour" : "À revoir"}</Pill>
              )}
            </div>
          </div>
          {a.purpose && <div className="text-[12px] text-slate mt-1">{a.purpose}</div>}
          {(a.dataSubjects || a.dataCategories) && (
            <div className="text-[11.5px] text-slate mt-0.5">
              {[a.dataSubjects, a.dataCategories, a.recipients].filter(Boolean).join(" · ")}
              {a.transferOutsideEu && <span className="text-rust"> · transfert hors UE</span>}
            </div>
          )}
          {!a.purpose && (
            <div className="text-[11.5px] text-rust mt-1">
              Finalité, personnes concernées et catégories de données manquantes — mentions exigées par l&apos;article 30.
            </div>
          )}
          {a.reviewNote && <div className="text-[11.5px] text-rust mt-1 leading-relaxed">{a.reviewNote}</div>}
        </div>
      ))}

      {canWrite && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[12.5px] font-semibold text-ink mb-3">Ajouter un traitement</div>
          <AddProcessingActivityForm />
        </div>
      )}
    </div>
  );
}

/**
 * Le registre, lu apprenant par apprenant.
 *
 * ÉCRAN CALCULÉ, PAS TABLE. Le registre de l'article 30 décrit ce que
 * l'organisme fait des données — huit à quinze lignes, tenues à jour à la
 * main, produites telles quelles en cas de contrôle. Le dupliquer par
 * apprenant le ferait exploser (4 000 apprenants × 10 traitements) et le
 * priverait de ce qui en fait un document : sa brièveté. Ici, chaque ligne
 * naît à l'affichage du croisement registre × dossier, et rien n'est
 * stocké — donc rien ne peut se désynchroniser du registre.
 *
 * Les règles du croisement (quel traitement concerne un apprenant, à quelle
 * date la conservation commence, combien de temps elle dure) vivent dans
 * lib/rgpdRetention.ts, testées : ce sont des règles juridiques, pas de la
 * mise en page.
 */
async function SuiviApprenantTab({
  organizationId,
  q,
  page,
  rawPage,
  peutClore,
}: {
  organizationId: string;
  q?: string;
  page: number;
  rawPage?: string;
  peutClore: boolean;
}) {
  const activities = await prisma.processingActivity.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, retentionPeriod: true, dataSubjects: true },
  });

  if (activities.length === 0) {
    return (
      <EmptyState
        title="Rien à suivre tant que le registre est vide"
        description="Cet écran croise vos traitements avec vos dossiers apprenants : sans traitement enregistré, il n'y a pas de durée de conservation à appliquer. Installez le registre type, puis revenez ici."
        action={
          <Button href="/rgpd" size="sm">
            Aller au registre
          </Button>
        }
      />
    );
  }

  const traitements = activities.filter((a) => traitementConcerneApprenants(a.dataSubjects));
  // Une ligne sans « personnes concernées » n'est pas rangée d'office chez
  // les apprenants : c'est un manque de l'article 30(1)(c), et le dire ici
  // est plus utile que de le deviner à leur place.
  const sansPersonnes = activities.filter((a) => !a.dataSubjects?.trim()).length;

  const where: Prisma.DossierWhereInput = {
    organizationId,
    ...(q
      ? {
          contact: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  // Le total vient d'un count() et jamais de la longueur de la page :
  // « 10 dossiers » affiché pour un organisme qui en a 8 000 serait pire
  // que pas de nombre du tout.
  const [total, dossiers] = await Promise.all([
    prisma.dossier.count({ where }),
    prisma.dossier.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        archivedAt: true,
        contact: { select: { firstName: true, lastName: true } },
        session: { select: { startsAt: true, mode: true, course: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE_SUIVI,
      take: PAGE_SIZE_SUIVI,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_SUIVI));
  const dossierIds = dossiers.map((d) => d.id);

  // « Obtenu le » : la signature du contrat quand elle existe. Deux chemins
  // mènent à une convention signée dans Jalon (le document signé via
  // Yousign ou le stub, et l'ancien envoi ClientOutreach marqué à la main) —
  // n'en lire qu'un ferait dater du jour de l'inscription des dossiers
  // pourtant signés.
  const [conventionsSignees, contratsAcquittes] = dossierIds.length
    ? await Promise.all([
        prisma.document.findMany({
          where: {
            organizationId,
            dossierId: { in: dossierIds },
            category: "convention",
            signatureStatus: "signed",
            signedAt: { not: null },
          },
          select: { dossierId: true, signedAt: true },
        }),
        prisma.clientOutreach.findMany({
          where: {
            organizationId,
            dossierId: { in: dossierIds },
            type: "contract",
            status: "acknowledged",
            acknowledgedAt: { not: null },
          },
          select: { dossierId: true, acknowledgedAt: true },
        }),
      ])
    : [[], []];

  const signaturesParDossier = new Map<string, Date[]>();
  function noterSignature(dossierId: string | null, date: Date | null) {
    if (!dossierId || !date) return;
    const liste = signaturesParDossier.get(dossierId);
    if (liste) liste.push(date);
    else signaturesParDossier.set(dossierId, [date]);
  }
  for (const d of conventionsSignees) noterSignature(d.dossierId, d.signedAt);
  for (const o of contratsAcquittes) noterSignature(o.dossierId, o.acknowledgedAt);

  const maintenant = new Date();
  // Le bouton de clôture ne s'affiche qu'une fois par dossier, sur sa
  // première ligne échue : l'action porte sur le dossier entier, la répéter
  // sous chaque traitement laisserait croire qu'il y en a plusieurs à faire.
  const dossiersDejaProposes = new Set<string>();

  const lignes = dossiers.flatMap((d) => {
    const { date: obtenuLe, source } = dateObtention(signaturesParDossier.get(d.id) ?? [], d.createdAt);
    return traitements.map((t) => {
      const echeance = echeanceConservation(obtenuLe, t.retentionPeriod);
      const statut = echeance ? statutConservation(echeance, maintenant) : null;
      const proposerCloture =
        statut === "echu" && peutClore && !d.archivedAt && !dossiersDejaProposes.has(d.id);
      if (proposerCloture) dossiersDejaProposes.add(d.id);
      return { dossier: d, traitement: t, obtenuLe, source, echeance, statut, proposerCloture };
    });
  });

  return (
    <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">Suivi par apprenant</div>
        <div className="text-[11.5px] text-slate mt-0.5 leading-relaxed">
          Vos {traitements.length} traitement{traitements.length > 1 ? "s" : ""}{" "}
          qui concernent des apprenants, appliqués à chaque dossier. Les statuts sont recalculés à chaque affichage — rien n&apos;est figé en base.
          Une échéance dépassée appelle une clôture de dossier, jamais une suppression.
        </div>
      </div>

      {traitements.length === 0 && (
        <div className="text-[12.5px] text-rust leading-relaxed">
          Aucun de vos traitements ne déclare d&apos;apprenants dans ses « personnes concernées ». Complétez cette
          mention au registre (article 30(1)(c)) pour que ce suivi ait de la matière.
        </div>
      )}
      {sansPersonnes > 0 && (
        <div className="text-[11.5px] text-rust">
          {sansPersonnes} traitement{sansPersonnes > 1 ? "s" : ""} sans personnes concernées renseignées
          {sansPersonnes > 1 ? " ne sont pas repris" : " n'est pas repris"}{" "}
          ici — mention exigée par l&apos;article 30(1)(c).
        </div>
      )}

      <div className="flex items-center gap-2.5 flex-wrap">
        <SearchInput placeholder="Rechercher un apprenant (nom, email)…" />
        <div className="text-[12px] text-slate">
          {total} dossier{total > 1 ? "s" : ""} · {PAGE_SIZE_SUIVI} par page
        </div>
      </div>

      {traitements.length > 0 && (
        <div>
          <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
            <div className="flex-[1.6]">Apprenant</div>
            <div className="flex-[2]">Traitement applicable</div>
            <div className="flex-[0.9]">Obtenu le</div>
            <div className="flex-[0.9]">Échéance</div>
            <div className="flex-[1.3]">Statut</div>
          </div>
          {lignes.map((l) => (
            <div
              key={`${l.dossier.id}-${l.traitement.id}`}
              className="flex items-center text-[12.5px] text-ink py-2 border-b border-line last:border-b-0"
            >
              <div className="flex-[1.6] min-w-0 pr-2">
                <Link
                  href={`/dossiers/${l.dossier.id}`}
                  className="text-ink underline decoration-line hover:decoration-ink"
                >
                  {l.dossier.contact.firstName} {l.dossier.contact.lastName}
                </Link>
                {/* La formation ET sa date : le même apprenant peut avoir
                    suivi deux fois la même, et les deux inscriptions n'ont
                    alors ni la même date d'obtention ni la même échéance. */}
                <div className="text-[11px] text-slate truncate">
                  {l.dossier.session.course.title}
                  {l.dossier.session.mode !== "ROLLING" &&
                    ` · ${format(l.dossier.session.startsAt, "d MMM yyyy", { locale: fr })}`}
                </div>
              </div>
              <div className="flex-[2] min-w-0 pr-2">
                <div className="truncate">{l.traitement.name}</div>
                {/* La mention brute reste sous les yeux : c'est elle qui fait
                    foi, la date n'en est qu'une lecture. */}
                <div className="text-[11px] text-slate truncate">{l.traitement.retentionPeriod}</div>
              </div>
              <div className="flex-[0.9] text-slate">
                {format(l.obtenuLe, "d MMM yyyy", { locale: fr })}
                <div className="text-[11px] text-ash">
                  {l.source === "signature" ? "signature" : "inscription"}
                </div>
              </div>
              <div className="flex-[0.9] text-slate">
                {l.echeance ? format(l.echeance, "d MMM yyyy", { locale: fr }) : "—"}
              </div>
              <div className="flex-[1.3] flex items-center gap-1.5 flex-wrap">
                {l.statut ? (
                  <Pill tone={STATUT_CONSERVATION_TONE[l.statut]}>{STATUT_CONSERVATION_LABELS[l.statut]}</Pill>
                ) : (
                  // Pas de date déductible : on le dit, plutôt que d'en
                  // inventer une. Voir analyserDureeConservation.
                  <span className="text-[11.5px] text-slate">Durée à préciser au registre</span>
                )}
                {l.dossier.archivedAt && <Pill tone="neutral">Déjà clôturé</Pill>}
                {l.proposerCloture && (
                  <RgpdClotureDossierButton
                    dossierId={l.dossier.id}
                    apprenant={`${l.dossier.contact.firstName} ${l.dossier.contact.lastName}`}
                  />
                )}
              </div>
            </div>
          ))}
          {lignes.length === 0 && (
            <div className="text-[12.5px] text-slate py-3">
              {q ? "Aucun apprenant ne correspond à cette recherche." : "Aucun dossier apprenant pour l'instant."}
            </div>
          )}
        </div>
      )}

      <Pagination
        basePath="/rgpd"
        searchParams={{ tab: "suivi-apprenant", q, page: rawPage }}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}

async function DpiaTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const [records, activities] = await Promise.all([
    prisma.dPIARecord.findMany({
      where: { organizationId },
      include: { processingActivity: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.processingActivity.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Analyses d&apos;impact (DPIA / AIPD)</div>
      <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[1.6]">Traitement lié</div>
        <div className="flex-[2]">Objet</div>
        {canWrite ? (
          <div className="flex-[2]">Risque &amp; statut</div>
        ) : (
          <>
            <div className="flex-1">Risque</div>
            <div className="flex-1">Statut</div>
          </>
        )}
      </div>
      {records.map((r) => (
        <div key={r.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
          <div className="flex-[1.6]">{r.processingActivity.name}</div>
          <div className="flex-[2] text-slate">{r.subject}</div>
          {canWrite ? (
            <div className="flex-[2]">
              <DpiaControls dpiaId={r.id} status={r.status} riskLevel={r.riskLevel} />
            </div>
          ) : (
            <>
              <div className="flex-1">
                <Pill tone={r.riskLevel === "high" ? "danger" : r.riskLevel === "moderate" ? "warn" : "good"}>
                  {RISK_LEVEL_LABELS[r.riskLevel] ?? r.riskLevel}
                </Pill>
              </div>
              <div className="flex-1">
                <Pill tone={r.status === "validated" ? "good" : r.status === "not_required" ? "neutral" : "warn"}>
                  {DPIA_STATUS_LABELS[r.status] ?? r.status}
                </Pill>
              </div>
            </>
          )}
        </div>
      ))}
      {records.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune DPIA enregistrée.</div>}

      {canWrite &&
        (activities.length > 0 ? (
          <div className="mt-5 pt-5 border-t border-line">
            <div className="text-[12.5px] font-semibold text-ink mb-3">Ajouter une DPIA</div>
            <AddDpiaForm activities={activities} />
          </div>
        ) : (
          <div className="mt-5 pt-5 border-t border-line text-[12.5px] text-slate">
            Ajoutez d&apos;abord un traitement dans le registre pour pouvoir lui associer une DPIA.
          </div>
        ))}
    </div>
  );
}

async function SubProcessorsTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const subProcessors = await prisma.subProcessor.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Sous-traitants & accords de traitement (DPA)</div>
      <div className="flex text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[1.4]">Prestataire</div>
        <div className="flex-[1.4]">Rôle</div>
        <div className="flex-1">Localisation</div>
        <div className={canWrite ? "flex-[1.6]" : "flex-[0.8]"}>DPA</div>
      </div>
      {subProcessors.map((s) => (
        <div key={s.id} className="flex items-center text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
          <div className="flex-[1.4]">{s.name}</div>
          <div className="flex-[1.4] text-slate">{s.role}</div>
          <div className="flex-1 text-slate">{s.location}</div>
          <div className={canWrite ? "flex-[1.6]" : "flex-[0.8]"}>
            {canWrite ? (
              <SubProcessorControls subProcessorId={s.id} name={s.name} dpaStatus={s.dpaStatus} />
            ) : (
              <Pill tone={s.dpaStatus === "signed" ? "good" : "warn"}>{s.dpaStatus === "signed" ? "Signé" : "En attente"}</Pill>
            )}
          </div>
        </div>
      ))}
      {subProcessors.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucun sous-traitant enregistré.</div>}

      {canWrite && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[12.5px] font-semibold text-ink mb-3">Ajouter un sous-traitant</div>
          <AddSubProcessorForm />
        </div>
      )}
    </div>
  );
}

async function RightsRequestsTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const [requests, members] = await Promise.all([
    prisma.rightsRequest.findMany({
      where: { organizationId },
      orderBy: { deadline: "asc" },
    }),
    canWrite
      ? prisma.user.findMany({
          where: { organizationId, status: "active", role: { not: "LEARNER" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const now = new Date();

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="text-[13.5px] font-semibold text-ink mb-3.5">Demandes d&apos;exercice des droits</div>
      <div className="flex items-center text-[11.5px] text-slate font-semibold uppercase tracking-wide pb-2 border-b border-line">
        <div className="flex-[1.2]">Type</div>
        <div className="flex-[1.6]">Personne</div>
        <div className="flex-1">Échéance</div>
        <div className={canWrite ? "flex-[1.6]" : "flex-[0.8]"}>{canWrite ? "Assignation & statut" : "Statut"}</div>
      </div>
      {requests.map((r) => {
        const overdue = r.status !== "closed" && r.deadline < now;
        return (
          <div key={r.id} className="text-[12.5px] text-ink py-2.5 border-b border-line last:border-b-0">
            <div className="flex items-center">
              <div className="flex-[1.2]">{REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}</div>
              <div className="flex-[1.6] text-slate">{r.personLabel}</div>
              <div className="flex-1 text-slate">{format(r.deadline, "d MMM yyyy", { locale: fr })}</div>
              <div className={canWrite ? "flex-[1.6]" : "flex-[0.8]"}>
                {canWrite ? (
                  <div className="flex items-center gap-2">
                    <RightsRequestControls requestId={r.id} status={r.status} assignedToUserId={r.assignedToUserId} members={members} />
                    {overdue && <Pill tone="danger">En retard</Pill>}
                  </div>
                ) : (
                  <Pill tone={overdue ? "danger" : r.status === "closed" ? "good" : "neutral"}>
                    {overdue ? "En retard" : STATUS_LABELS[r.status] ?? r.status}
                  </Pill>
                )}
              </div>
            </div>
            {/* Sans ce détail, une demande d'accès interne se lit « Accès
                interne — Marie Dupont » : ni qui demande, ni pourquoi. Le
                DPO ne peut rien en faire. */}
            {r.details && <div className="text-[11.5px] text-slate mt-1 leading-relaxed">{r.details}</div>}
          </div>
        );
      })}
      {requests.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucune demande enregistrée.</div>}

      {canWrite && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[12.5px] font-semibold text-ink mb-3">Enregistrer une demande</div>
          <AddRightsRequestForm />
        </div>
      )}
    </div>
  );
}

async function DataBreachesTab({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const breaches = await prisma.dataBreach.findMany({
    where: { organizationId },
    orderBy: { discoveredAt: "desc" },
  });
  const now = new Date();

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13.5px] font-semibold text-ink">Violations de données</div>
        {canWrite && <AddDataBreachDialog />}
      </div>
      <div className="text-[11.5px] text-slate mb-3.5">
        Registre des incidents de sécurité affectant des données personnelles (art. 33/34 RGPD) — distinct du registre
        des traitements et des DPIA, qui couvrent le risque anticipé plutôt que ce qui s&apos;est réellement produit.
      </div>
      {breaches.map((b) => {
        const hoursSinceDiscovery = differenceInHours(now, b.discoveredAt);
        const notificationOverdue = !b.notifiedAuthorityAt && hoursSinceDiscovery > 72 && b.status !== "closed";
        return (
          <div key={b.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-ink">{b.title}</div>
              <div className="flex items-center gap-1.5 shrink-0">
                {notificationOverdue && <Pill tone="danger">Notification CNIL en retard</Pill>}
                <Pill tone={b.severity === "high" ? "danger" : b.severity === "moderate" ? "warn" : "neutral"}>
                  {BREACH_SEVERITY_LABELS[b.severity] ?? b.severity}
                </Pill>
              </div>
            </div>
            <div className="text-[12px] text-slate">
              Découverte le {format(b.discoveredAt, "d MMM yyyy 'à' HH:mm", { locale: fr })} · {b.affectedDataTypes}
              {b.affectedPeopleCount !== null && ` · ~${b.affectedPeopleCount} personne${b.affectedPeopleCount > 1 ? "s" : ""} concernée${b.affectedPeopleCount > 1 ? "s" : ""}`}
            </div>
            <div className="text-[12.5px] text-ink">{b.description}</div>
            {canWrite ? (
              <DataBreachControls breachId={b.id} status={b.status} notifiedAuthorityAt={b.notifiedAuthorityAt} notifiedSubjectsAt={b.notifiedSubjectsAt} />
            ) : (
              <div className="text-[11.5px] text-slate">{BREACH_STATUS_LABELS[b.status] ?? b.status}</div>
            )}
          </div>
        );
      })}
      {breaches.length === 0 && <div className="text-[12.5px] text-slate py-3">Aucun incident enregistré.</div>}
    </div>
  );
}
