import { put } from "@vercel/blob";
import { generatePdfFromRichText, type MiseEnPageDocument } from "@/lib/htmlToPdf";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import { privateStoreToken } from "@/lib/storage";
import { nextInvoiceReference } from "@/lib/invoiceReference";
import { messageDoublonEcheancier, verifierEcheancierDejaFacture } from "@/lib/echeancierDoublon";
import { DocStatus, PipelineStage } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const NOT_CONFIGURED_ERROR =
  "Stockage de fichiers momentanément indisponible — BLOB_PRIVATE_READ_WRITE_TOKEN n'est pas configuré côté serveur (voir README).";

/**
 * Nom de fichier sûr, accents compris.
 *
 * L'ancienne version filtrait sur `\w`, qui ne couvre que [A-Za-z0-9_] : tout
 * caractère accentué disparaissait purement et simplement, et « Bilan
 * intermédiaire » arrivait chez le destinataire en « Bilan intermdiaire ».
 * On garde donc les lettres de n'importe quel alphabet (\p{L}) et les
 * chiffres (\p{N}), et on remplace tout le reste — séparateurs de chemin,
 * caractères de contrôle, ponctuation réservée — par une espace.
 */
export function safeFileStem(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} _.\-']/gu, " ")
    .replace(/\s+/g, " ")
    // Un nom commençant par un point donne un fichier caché ; une suite de
    // points ouvrirait un « .. » de remontée de répertoire.
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+/, "")
    .trim();
  return cleaned.slice(0, 80).trim() || "document";
}

/**
 * Idem pour un fichier téléversé, extension conservée. Son nom venait du
 * poste du client et partait tel quel dans le chemin de stockage : un nom
 * contenant « / » ou « .. » n'avait rien à y faire.
 */
export function safeUploadName(original: string): string {
  const lastDot = original.lastIndexOf(".");
  const hasExtension = lastDot > 0 && lastDot < original.length - 1;
  const stem = safeFileStem(hasExtension ? original.slice(0, lastDot) : original);
  if (!hasExtension) return stem;
  const extension = original
    .slice(lastDot + 1)
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 10);
  return extension ? `${stem}.${extension}` : stem;
}

/**
 * L'habillage du document : identité de l'organisme + octets du logo.
 *
 * Vit ici plutôt que dans htmlToPdf.ts parce que ce module-là ne connaît ni
 * Prisma ni le réseau. Deux garde-fous qui comptent :
 *
 *   — le téléchargement du logo est borné dans le temps ET ses erreurs sont
 *     avalées : un blob momentanément indisponible ne doit jamais empêcher
 *     un contrat de partir. Un document sans logo reste valable ; un
 *     document absent, non.
 *   — un logo trop lourd est ignoré : il gonflerait chaque PDF envoyé.
 */
const LOGO_MAX_OCTETS = 1_500_000;

export async function chargerMiseEnPage(organizationId: string): Promise<MiseEnPageDocument | undefined> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      logoUrl: true,
      legalForm: true,
      legalAddress: true,
      siret: true,
      activityDeclarationNumber: true,
      regionPrefecture: true,
      publicContactPhone: true,
      publicContactEmail: true,
    },
  });
  if (!org) return undefined;

  let logo: Uint8Array | null = null;
  if (org.logoUrl) {
    try {
      const reponse = await fetch(org.logoUrl, { signal: AbortSignal.timeout(4000) });
      if (reponse.ok) {
        const octets = new Uint8Array(await reponse.arrayBuffer());
        if (octets.byteLength <= LOGO_MAX_OCTETS) logo = octets;
      }
    } catch {
      logo = null;
    }
  }

  return {
    organisme: {
      nom: org.name,
      logoUrl: org.logoUrl,
      formeJuridique: org.legalForm,
      adresseLegale: org.legalAddress,
      siret: org.siret,
      numeroDeclarationActivite: org.activityDeclarationNumber,
      prefectureRegion: org.regionPrefecture,
      telephone: org.publicContactPhone,
      email: org.publicContactEmail,
    },
    logo,
  };
}

// Shared by the dossier and CRM-prospect "envoyer un document" send routes:
// turns either a rich-text template (→ a real generated PDF) or an
// uploaded file into (a) a persisted Blob so it shows up in the existing
// Documents list the same way an upload always has, and (b) base64 bytes
// ready to attach to the notification email — client feedback wants a real
// attachment, not a link to click.
export async function buildDocumentAttachment(params: {
  // « bytes » : un PDF déjà produit ailleurs — aujourd'hui un devis, rendu
  // par lib/invoiceDocument.ts. Il passe quand même par ici pour être
  // stocké, tracé et joint exactement comme les autres : un envoi qui
  // contournerait cette fonction serait un envoi qu'aucun écran ne
  // retrouverait.
  mode: "template" | "upload" | "bytes";
  title: string;
  bodyHtml?: string;
  file?: File;
  bytes?: { buffer: Buffer; fileName: string; mimeType: string };
  organizationId: string;
  ownerKey: string; // dossierId, or `opportunity-<id>` for a prospect with no dossier yet
}): Promise<{ fileUrl: string; fileName: string; sizeBytes: number; contentBase64: string; mimeType: string }> {
  if (!privateStoreToken()) throw new Error(NOT_CONFIGURED_ERROR);

  let buffer: Buffer;
  let fileName: string;
  let mimeType: string;

  if (params.mode === "bytes") {
    if (!params.bytes) throw new Error("Contenu requis.");
    buffer = params.bytes.buffer;
    fileName = params.bytes.fileName;
    mimeType = params.bytes.mimeType;
  } else if (params.mode === "template") {
    // L'en-tête et le pied de page arrivent par ici : tous les envois de
    // document passent par cette fonction, donc l'habillage apparaît partout
    // sans avoir à le brancher écran par écran.
    const miseEnPage = await chargerMiseEnPage(params.organizationId);
    buffer = await generatePdfFromRichText(params.title, params.bodyHtml ?? "", miseEnPage);
    fileName = `${safeFileStem(params.title)}.pdf`;
    mimeType = "application/pdf";
  } else {
    if (!params.file) throw new Error("Fichier requis.");
    const arrayBuffer = await params.file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    fileName = safeUploadName(params.file.name);
    mimeType = params.file.type || "application/octet-stream";
  }

  // Private, like every other upload path — see the note in src/lib/storage.ts.
  // These are the signed conventions and contracts themselves. The recipient
  // still gets the actual bytes as an email attachment, so making the stored
  // copy private costs them nothing; it only closes the permanent
  // unauthenticated back door the public URL used to be.
  const pathname = `documents/${params.organizationId}/${params.ownerKey}/${fileName}`;
  const blob = await put(pathname, buffer, {
    access: "private",
    addRandomSuffix: true,
    contentType: mimeType,
    token: privateStoreToken(),
  });

  return {
    fileUrl: blob.url,
    fileName,
    sizeBytes: buffer.byteLength,
    contentBase64: buffer.toString("base64"),
    mimeType,
  };
}

/**
 * Le document signé, vu par la chaîne de signature. Une ligne `Document` de
 * Prisma satisfait ce type telle quelle : c'est ce que passent les trois
 * routes, sans projection ni reconstruction.
 */
export type DocumentSigne = {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  sentByUserId: string | null;
  dossierId: string | null;
  subcontractorId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  paymentSchedule: unknown;
};

/**
 * Ce qui se passe quand un document est signé — les trois effets, en un
 * seul appel.
 *
 * Trois voies mènent ici, et elles doivent produire exactement la même
 * chose :
 *   — l'apprenant qui signe en ligne  (/api/documents/[id]/sign)
 *   — le webhook Yousign              (/api/webhooks/yousign/[organizationId])
 *   — « Marquer signé », retour papier (/api/documents/[id]/mark-signed)
 *
 * Elles ne la produisaient pas. « Marquer signé » appelait deux effets sur
 * trois : il oubliait l'échéancier, donc un contrat signé en présentiel — le
 * cas le plus fréquent chez un petit organisme — ne produisait aucune
 * facture. Trois copies d'une même séquence finissent toujours par diverger
 * comme celle-là. La séquence n'existe donc plus qu'ici, et les trois effets
 * ne sont plus exportés : une quatrième voie de signature ne PEUT plus en
 * oublier un, elle n'a pas accès aux morceaux.
 *
 * Rien ne diffère d'une voie à l'autre, pas même l'organisation :
 * `organizationId` se lit sur le document lui-même. C'est délibéré — le
 * webhook, lui, reçoit dans son URL un organizationId qui vaut parfois la
 * chaîne littérale « platform » (l'abonnement Yousign de Jalon, qui porte
 * les événements de tous les locataires). Le lire là plutôt que sur la
 * ligne signée serait un bug d'un seul caractère ; il n'y a plus de choix à
 * faire.
 *
 * L'ordre compte : le mail part en DERNIER parce qu'il rend compte de ce
 * qui s'est réellement passé, échéancier compris. Contrepartie assumée — si
 * la création des factures échoue franchement, la route remonte l'erreur et
 * aucun mail ne part : l'organisme voit l'échec de l'action plutôt qu'une
 * confirmation à moitié fausse.
 */
export async function traiterDocumentSigne(document: DocumentSigne): Promise<{ echeancier: ResultatEcheancier }> {
  await syncParcoursFromSignedDocument(document);
  const echeancier = await materialiseScheduleFromSignedDocument(document);
  await notifyDocumentSigned(
    document,
    document.organizationId,
    echeancier.statut === "doublon_evite" ? echeancier.avertissement : undefined,
  );
  return { echeancier };
}

// Un des trois effets d'une signature. N'est plus exporté : la seule
// entrée publique est traiterDocumentSigne() ci-dessus — voir le
// commentaire qui l'accompagne pour la raison.
async function notifyDocumentSigned(
  document: {
    id: string;
    title: string;
    sentByUserId: string | null;
    dossierId: string | null;
    subcontractorId?: string | null;
    // Quatrième propriétaire : un prospect sans dossier. Sans lui, un
    // commercial qui envoyait une convention depuis le CRM n'apprenait
    // jamais qu'elle avait été signée.
    contactId?: string | null;
  },
  organizationId: string,
  // Ce que la signature n'a PAS fait, quand il y a quelque chose à dire.
  //
  // Deux des trois voies de signature — le webhook Yousign et le clic de
  // l'apprenant — n'ont aucun écran en face : personne ne lira une valeur
  // de retour. Ce mail est le seul canal qui atteigne un humain de
  // l'organisme quelle que soit la voie, donc c'est lui qui porte
  // l'avertissement.
  avertissement?: string,
): Promise<void> {
  if (!document.sentByUserId || (!document.dossierId && !document.subcontractorId && !document.contactId)) return;
  const [sender, organization, dossier, subcontractor, contact] = await Promise.all([
    prisma.user.findUnique({ where: { id: document.sentByUserId } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    document.dossierId ? prisma.dossier.findUnique({ where: { id: document.dossierId }, include: { contact: true } }) : null,
    document.subcontractorId ? prisma.subcontractor.findUnique({ where: { id: document.subcontractorId } }) : null,
    document.contactId ? prisma.contact.findUnique({ where: { id: document.contactId } }) : null,
  ]);
  if (!sender || (!dossier && !subcontractor && !contact)) return;
  // Le dossier d'abord : quand les deux existent, c'est l'inscription qui
  // nomme le signataire, pas la fiche prospect dont elle est issue.
  const signerName = dossier
    ? `${dossier.contact.firstName} ${dossier.contact.lastName}`
    : subcontractor
      ? subcontractor.name
      : `${contact!.firstName} ${contact!.lastName}`;
  try {
    await sendTransactionalEmail({
      to: sender.email,
      toName: sender.name,
      subject: `Document signé — ${document.title}`,
      text: avertissement
        ? `${signerName} vient de signer « ${document.title} ».\n\nAttention : ${avertissement}`
        : `${signerName} vient de signer « ${document.title} ».`,
      senderName: organization.name,
    });
  } catch {
    // Non-fatal — the signature itself is recorded either way.
  }
}

// Same audit-UX principle as the needs-assessment public route (see
// /api/public/needs-assessment/[token]): a Dossier's "Parcours de
// formation" checklist step should flip itself the moment the underlying
// event actually happens, not wait for staff to notice and toggle it by
// hand. "Convention signée" used to be the one step still requiring a
// manual click (the old /api/client-outreach/[id] PATCH route, from
// before Yousign was wired for real) — this closes that gap for the
// generic SendDocumentDialog path: any "convention"-category Document
// reaching signatureStatus "signed" (stub or real Yousign) marks the
// dossier's contract step done too. Silently a no-op for every other
// document category, so it's safe to call unconditionally from both
// signature-completion routes. Interne comme les deux autres effets : on
// n'y entre que par traiterDocumentSigne().
async function syncParcoursFromSignedDocument(document: {
  category: string;
  dossierId: string | null;
  opportunityId?: string | null;
}): Promise<void> {
  if (document.category !== "convention") return;

  if (document.dossierId) {
    await prisma.dossier.update({ where: { id: document.dossierId }, data: { contractSigned: true } });
    return;
  }

  // Côté prospect, l'équivalent de « convention signée » est l'étape
  // CONTRACT_SIGNED du pipeline. Même principe que le dossier : l'événement
  // fait avancer l'étape lui-même, plutôt que d'attendre qu'un commercial
  // s'en aperçoive et déroule le sélecteur.
  //
  // Ciblé par opportunityId — plus précis que par contact, qui peut porter
  // plusieurs affaires en parallèle. Ne fait rien si l'affaire est déjà plus
  // loin : une signature n'a jamais à faire reculer un pipeline.
  if (document.opportunityId) {
    await prisma.opportunity.updateMany({
      where: {
        id: document.opportunityId,
        stage: { in: [PipelineStage.PROSPECT, PipelineStage.QUOTE_SENT] },
      },
      data: { stage: PipelineStage.CONTRACT_SIGNED },
    });
  }
}

/**
 * Ce que la matérialisation de l'échéancier a donné.
 *
 * Un simple nombre ne suffisait plus : « 0 facture créée » recouvrait trois
 * situations qui n'appellent pas du tout la même réaction — pas
 * d'échéancier du tout, échéancier déjà matérialisé (le rejeu normal, stub
 * puis webhook), et « des factures ressemblant à cet échéancier existent
 * déjà ». Seule la dernière doit remonter à l'organisme ; les deux autres
 * sont des non-événements.
 */
export type ResultatEcheancier =
  | { statut: "cree"; facturesCreees: number }
  | { statut: "sans_echeancier" }
  | { statut: "deja_materialise" }
  | { statut: "doublon_evite"; nombreFactures: number; totalCentimes: number; avertissement: string };

// The moment a contract carrying a payment schedule is signed, its
// instalments become money owed — and money owed, in this app, is an
// Invoice row. That single fact is what makes everything downstream work
// without new code: overdue detection (dashboardTasks), bank
// reconciliation, automatic PAID once covered (recordInvoicePayment).
//
// Deliberately AT SIGNATURE, not at send: the schedule sits inert on
// Document.paymentSchedule until then, so a contract that is never signed
// never leaves phantom instalments in Facturation.
//
// Instalments are born DRAFT, dated from the schedule: the daily cron
// issues each one (DRAFT → SENT, with the notification email) shortly
// before it falls due, instead of the whole schedule landing in the
// learner's inbox on signature day.
//
// Interne, comme les deux autres effets : on n'y entre que par
// traiterDocumentSigne(), donc un échéancier devient des factures d'une
// seule façon, quelle que soit la voie par laquelle la signature est
// arrivée.
async function materialiseScheduleFromSignedDocument(document: {
  id: string;
  organizationId: string;
  dossierId: string | null;
  // Un contrat signé par un prospect porte le même échéancier et la même
  // promesse d'argent qu'un contrat de dossier. Il ne créait pourtant
  // aucune facture, faute de dossierId — la fonction sortait à la
  // première ligne.
  contactId?: string | null;
  category: string;
  paymentSchedule: unknown;
}): Promise<ResultatEcheancier> {
  // Périmètre des factures qui « comptent » pour ce contrat.
  //
  // Les factures de l'AUTRE dossier du même contact appartiennent à ce
  // dossier-là, pas à ce contrat : elles sont hors périmètre. En revanche les
  // factures du contact rattachées à AUCUN dossier doivent compter, même
  // quand ce contrat porte un dossier — et c'est le point qui manquait.
  // Le champ « Dossier de formation » est explicitement facultatif dans
  // « Nouvelle facture », et le composeur du CRM ne l'envoie jamais : une
  // facture saisie à la main n'a donc, par défaut, PAS de dossier. C'est
  // exactement la forme que prennent les factures créées à la main par un
  // organisme qui compensait ce trou depuis des mois. Les ignorer aurait
  // laissé la garde anti-doublon aveugle au cas le plus fréquent.
  //
  // Le risque est asymétrique et tranche le doute : rattacher à tort une
  // facture sans dossier à ce contrat fait au pire ressaisir un échéancier ;
  // l'ignorer fait facturer deux fois un client. Le critère du total exact
  // (voir lib/echeancierDoublon.ts) reste de toute façon le vrai filtre.
  const dossierId = document.dossierId;
  const contactIdDuDocument = document.contactId ?? null;
  const contactIdDuDossier = dossierId
    ? ((await prisma.dossier.findUnique({ where: { id: dossierId }, select: { contactId: true } }))?.contactId ?? null)
    : null;
  const contactIdFacturable = contactIdDuDossier ?? contactIdDuDocument;

  const perimetreFactures: Prisma.InvoiceWhereInput | null = dossierId
    ? contactIdFacturable
      ? { OR: [{ dossierId }, { contactId: contactIdFacturable, dossierId: null }] }
      : { dossierId }
    : contactIdDuDocument
      ? { contactId: contactIdDuDocument, dossierId: null }
      : null;
  if (!perimetreFactures) return { statut: "sans_echeancier" };

  const schedule = parseStoredSchedule(document.paymentSchedule);
  if (schedule.length === 0) return { statut: "sans_echeancier" };

  // Idempotency: one set of instalments per dossier, ever. Both signature
  // paths can fire for one document (stub then webhook), and a corrected
  // contract re-signed later must not double-bill the learner — if the
  // schedule genuinely changed, staff adjusts the existing invoices in
  // Facturation, where the money now lives.
  //
  // Côté prospect, la même garantie porte sur le document lui-même plutôt
  // que sur le dossier : un contact peut signer plusieurs contrats, chacun
  // avec son échéancier, et ils ne doivent pas s'annuler l'un l'autre.
  const existing = await prisma.invoice.count({
    where: dossierId
      ? { dossierId, installmentNumber: { not: null } }
      : { sourceDocumentId: document.id, installmentNumber: { not: null } },
  });
  if (existing > 0) return { statut: "deja_materialise" };

  // Second garde-fou, celui qui manquait : les factures SAISIES À LA MAIN.
  //
  // Le compte ci-dessus ne voit que les échéances déjà matérialisées. Or
  // « Marquer signé » ne matérialisait rien jusqu'ici : un organisme qui a
  // vécu avec ce trou a créé ces factures lui-même, à la main, après chaque
  // signature en présentiel. Sans ce garde-fou, son premier « Marquer
  // signé » d'après le correctif lui donnerait les deux séries. Voir
  // lib/echeancierDoublon.ts pour le critère retenu et pourquoi c'est
  // celui-là.
  const facturesManuelles = await prisma.invoice.findMany({
    where: {
      organizationId: document.organizationId,
      ...perimetreFactures,
      // Une facture saisie à la main n'a pas de numéro d'échéance : c'est
      // très exactement ce qui la distingue d'une échéance matérialisée.
      installmentNumber: null,
      // Payée = argent encaissé, affaire classée. Un acompte réglé avant la
      // signature ne dit pas que le reste de l'échéancier a été facturé.
      status: { not: DocStatus.PAID },
    },
    select: { amountCents: true },
  });
  const verdict = verifierEcheancierDejaFacture(schedule, facturesManuelles);
  if (verdict.dejaFacture) {
    const avertissement = messageDoublonEcheancier(verdict);
    // Tracé côté serveur EN PLUS d'être rendu à l'appelant et envoyé par
    // mail : il reste le dernier filet quand un document n'a pas
    // d'expéditeur connu (sentByUserId null sur les vieilles lignes), cas
    // où le mail ne part pas et où personne ne lit la réponse d'un webhook.
    console.warn(`[echeancier] Document ${document.id} — matérialisation écartée. ${avertissement}`);
    return {
      statut: "doublon_evite",
      nombreFactures: verdict.nombreFactures,
      totalCentimes: verdict.totalFacturesCentimes,
      avertissement,
    };
  }

  // Déjà lu plus haut pour construire le périmètre — une requête, deux usages.
  const contactId = contactIdFacturable;
  if (!contactId) return { statut: "sans_echeancier" };

  // Sequential on purpose: nextInvoiceReference counts existing rows, so
  // creating in parallel would hand several instalments the same reference.
  let created = 0;
  for (const [i, instalment] of schedule.entries()) {
    await prisma.invoice.create({
      data: {
        organizationId: document.organizationId,
        contactId,
        // Null côté prospect, et c'est correct : la facture existe, elle
        // n'est simplement rattachée à aucune inscription — Invoice.dossierId
        // est nullable exactement pour ce cas.
        dossierId,
        reference: await nextInvoiceReference(document.organizationId),
        amountCents: instalment.amountCents,
        status: "DRAFT",
        dueDate: new Date(`${instalment.dueDate}T00:00:00.000Z`),
        installmentNumber: i + 1,
        installmentTotal: schedule.length,
        sourceDocumentId: document.id,
        // BPF vocabulary: a contrat_formation is by definition the learner's
        // own money; a convention's schedule is the company's.
        fundingOrigin: document.category === "contrat_formation" ? "individual" : "company",
      },
    });
    created++;
  }
  return { statut: "cree", facturesCreees: created };
}

// Defensive re-parse of Document.paymentSchedule (Json?): it was validated
// by the send route, but a Json column proves nothing at read time. A
// malformed entry drops silently — better no invoice than a wrong one.
function parseStoredSchedule(raw: unknown): { dueDate: string; amountCents: number; label?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is { dueDate: string; amountCents: number; label?: string } =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test((e as { dueDate: string }).dueDate) &&
      typeof (e as Record<string, unknown>).amountCents === "number" &&
      (e as { amountCents: number }).amountCents > 0,
  );
}
