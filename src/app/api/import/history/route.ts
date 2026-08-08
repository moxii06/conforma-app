import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import {
  cellFor,
  isValidEmail,
  splitFullName,
  parseLearnerCategory,
  parseFundingOrigin,
  parseFrenchDate,
  parseHours,
  parsePriceCents,
  type ImportMapping,
} from "@/lib/dataImport";
import { readImportFile, tooManyRowsError, mapLimit } from "@/lib/importFile";

// Plusieurs requêtes par ligne, bornées — voir importFile.ts.
export const maxDuration = 60;

/**
 * Reprise de l'historique d'un ancien outil. Une ligne = une inscription
 * passée.
 *
 * Le problème qu'on répare (audit S7, P0 n°4) : on savait importer un
 * annuaire de contacts et un catalogue de formations, mais aucune session
 * passée, aucune facture historique. Après migration, l'organisme voyait
 * 4 000 contacts et un historique vide — et comme les inscriptions
 * reprises étaient datées du jour, son bilan pédagogique et financier des
 * années antérieures sortait à zéro et l'année courante surchargée. Le BPF
 * est une déclaration légale annuelle : le faux y est plus grave
 * qu'ailleurs.
 *
 * Ce que la route fabrique, dans cet ordre :
 *   contact → formation → session (partagée) → dossier → facture payée
 *
 * Les trois choses que lit computeBpfReport sont donc reconstituées : des
 * dossiers rattachés à une session dont la date de début tombe dans la
 * bonne année, des heures d'enseignement, et des factures payées datées de
 * leur encaissement réel.
 */

type Ligne = {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  courseTitle: string;
  startsAt: Date;
  endsAt: Date;
  hours: number | null;
  category: string | null;
  invoiceReference: string;
  amountCents: number | null;
  fundingOrigin: string | null;
  paidAt: Date | null;
};

/** Clé de regroupement des sessions : une formation, un jour de début. */
function cleSession(courseId: string, startsAt: Date): string {
  return `${courseId}|${startsAt.toISOString().slice(0, 10)}`;
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // La reprise d'historique écrit des sessions, des dossiers ET des
  // factures payées : elle touche à la déclaration BPF. On exige le droit
  // le plus fort des trois, pas le plus faible.
  if (can(session.roles, "invoicing") !== "full" || can(session.roles, "courses") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  const { organizationId } = session;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  let mapping: ImportMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Paramètres d'import invalides." }, { status: 400 });
  }
  for (const [cle, libelle] of [
    ["email", "Email de l'apprenant"],
    ["courseTitle", "Formation suivie"],
    ["startDate", "Date de début"],
  ] as const) {
    if (!mapping[cle]) {
      return NextResponse.json(
        { error: `La colonne « ${libelle} » doit être associée — sans elle, l'inscription ne peut pas être datée ni rattachée.` },
        { status: 400 }
      );
    }
  }

  const table = await readImportFile(formData);
  if (table instanceof NextResponse) return table;
  const tooMany = tooManyRowsError(table);
  if (tooMany) return tooMany;

  // ---------------------------------------------------------------------
  // Lecture

  const errors: { line: number; message: string }[] = [];
  const lignes: Ligne[] = [];

  table.rows.forEach((row, i) => {
    const line = i + 2; // la ligne 1 est l'en-tête
    const email = cellFor(table, row, mapping, "email").toLowerCase();
    if (!email) return errors.push({ line, message: "Email manquant — ligne ignorée." });
    if (!isValidEmail(email)) return errors.push({ line, message: `Email invalide (« ${email} ») — ligne ignorée.` });

    const courseTitle = cellFor(table, row, mapping, "courseTitle");
    if (!courseTitle) return errors.push({ line, message: "Formation manquante — ligne ignorée." });

    const debutBrut = cellFor(table, row, mapping, "startDate");
    const startsAt = parseFrenchDate(debutBrut);
    if (!startsAt) {
      // C'est la date qui décide de l'année déclarée : une date illisible
      // fait tomber l'inscription dans le mauvais exercice. On refuse.
      return errors.push({
        line,
        message: `Date de début illisible (« ${debutBrut} ») — attendu JJ/MM/AAAA ou AAAA-MM-JJ. Ligne ignorée.`,
      });
    }
    const finBrute = cellFor(table, row, mapping, "endDate");
    const endsAt = (finBrute && parseFrenchDate(finBrute)) || startsAt;
    if (finBrute && !parseFrenchDate(finBrute)) {
      errors.push({ line, message: `Date de fin illisible (« ${finBrute} ») — la date de début est utilisée.` });
    }

    let firstName = cellFor(table, row, mapping, "firstName");
    let lastName = cellFor(table, row, mapping, "lastName");
    if (!firstName && !lastName) {
      const complet = cellFor(table, row, mapping, "fullName");
      if (complet) ({ firstName, lastName } = splitFullName(complet));
    }

    const montantBrut = cellFor(table, row, mapping, "amount");
    const amountCents = montantBrut ? parsePriceCents(montantBrut) : null;
    if (montantBrut && amountCents === null) {
      errors.push({ line, message: `Montant illisible (« ${montantBrut} ») — inscription reprise sans facture.` });
    }
    const paiementBrut = cellFor(table, row, mapping, "paidDate");

    lignes.push({
      line,
      email,
      firstName: firstName || (lastName ? "" : email.split("@")[0]),
      lastName: lastName || "",
      courseTitle,
      startsAt,
      endsAt: endsAt < startsAt ? startsAt : endsAt,
      hours: parseHours(cellFor(table, row, mapping, "hours")),
      category: parseLearnerCategory(cellFor(table, row, mapping, "category")),
      invoiceReference: cellFor(table, row, mapping, "invoiceReference"),
      amountCents,
      fundingOrigin: parseFundingOrigin(cellFor(table, row, mapping, "fundingOrigin")),
      // Faute de date d'encaissement, la facture est datée de la fin de la
      // formation. C'est ce qui range le chiffre d'affaires dans le bon
      // exercice à défaut du bon mois — inventer « aujourd'hui » le
      // rangerait dans l'année courante, exactement le défaut qu'on répare.
      paidAt: (paiementBrut && parseFrenchDate(paiementBrut)) || null,
    });
  });

  if (lignes.length === 0) {
    errors.sort((a, b) => a.line - b.line);
    return NextResponse.json({ totalRows: table.rows.length, errors, ...VIDE });
  }

  // ---------------------------------------------------------------------
  // Référents partagés, résolus UNE fois — avant la passe concurrente, pour
  // que deux lignes de la même session ne la créent pas en double.

  const now = new Date();
  const courseIdByTitle = new Map<string, string>();
  for (const titre of new Set(lignes.map((l) => l.courseTitle))) {
    const existante = await prisma.course.findFirst({
      where: { organizationId, title: { equals: titre, mode: "insensitive" } },
      select: { id: true },
    });
    if (existante) {
      courseIdByTitle.set(titre, existante.id);
      continue;
    }
    // La durée nominale n'est PAS déduite de l'historique : deux sessions
    // d'une même formation peuvent avoir duré différemment, et c'est la
    // session qui porte ses heures (Session.declaredHours).
    const creee = await prisma.course.create({ data: { organizationId, title: titre } });
    courseIdByTitle.set(titre, creee.id);
  }

  // Une session par (formation, jour de début) : trente stagiaires d'une
  // même promotion partagent une seule session, sinon le planning
  // afficherait trente sessions d'une personne et le BPF compterait bon
  // mais l'écran mentirait.
  const sessionIdByCle = new Map<string, string>();
  const heuresParCle = new Map<string, number>();
  const effectifParCle = new Map<string, number>();
  for (const l of lignes) {
    const courseId = courseIdByTitle.get(l.courseTitle)!;
    const cle = cleSession(courseId, l.startsAt);
    effectifParCle.set(cle, (effectifParCle.get(cle) ?? 0) + 1);
    if (l.hours == null) continue;
    const dejaVu = heuresParCle.get(cle);
    if (dejaVu == null) heuresParCle.set(cle, l.hours);
    else if (dejaVu !== l.hours) {
      // Divergence signalée, jamais moyennée : une heure inventée sur une
      // déclaration légale ne se voit pas, un avertissement se corrige.
      errors.push({
        line: l.line,
        message: `Heures divergentes pour la même session (${dejaVu} h déjà déclarées, ${l.hours} h ici) — ${dejaVu} h conservées.`,
      });
    }
  }

  let sessionsCreees = 0;
  for (const l of lignes) {
    const courseId = courseIdByTitle.get(l.courseTitle)!;
    const cle = cleSession(courseId, l.startsAt);
    if (sessionIdByCle.has(cle)) continue;

    const jour = new Date(Date.UTC(l.startsAt.getUTCFullYear(), l.startsAt.getUTCMonth(), l.startsAt.getUTCDate()));
    const lendemain = new Date(jour.getTime() + 86_400_000);
    const existante = await prisma.session.findFirst({
      where: { organizationId, courseId, startsAt: { gte: jour, lt: lendemain } },
      select: { id: true },
    });
    if (existante) {
      sessionIdByCle.set(cle, existante.id);
      continue;
    }
    const creee = await prisma.session.create({
      data: {
        organizationId,
        courseId,
        startsAt: l.startsAt,
        endsAt: l.endsAt,
        // Le fichier ne dit pas le présentiel ou le distanciel, et le BPF
        // ne s'en sert pas. Valeur par défaut, corrigeable à la main.
        format: "IN_PERSON",
        status: "VALIDATED",
        capacity: effectifParCle.get(cle) ?? 1,
        declaredHours: heuresParCle.get(cle) ?? null,
        importedAt: now,
        // Une session de 2022 n'a rien à faire dans la liste active du
        // planning : elle part directement aux archives, où elle reste
        // consultable.
        archivedAt: now,
      },
      select: { id: true },
    });
    sessionIdByCle.set(cle, creee.id);
    sessionsCreees++;
  }

  const contactsExistants = await prisma.contact.findMany({
    where: { organizationId, email: { in: [...new Set(lignes.map((l) => l.email))] } },
    select: { id: true, email: true },
  });
  const contactIdByEmail = new Map(contactsExistants.map((c) => [c.email.toLowerCase(), c.id]));
  let contactsCrees = 0;
  for (const email of new Set(lignes.map((l) => l.email))) {
    if (contactIdByEmail.has(email)) continue;
    const l = lignes.find((x) => x.email === email)!;
    const contact = await prisma.contact.create({
      data: { organizationId, email, firstName: l.firstName, lastName: l.lastName },
      select: { id: true },
    });
    contactIdByEmail.set(email, contact.id);
    contactsCrees++;
  }

  // ---------------------------------------------------------------------
  // Écriture ligne à ligne

  let dossiersCrees = 0;
  let dossiersDejaPresents = 0;
  let facturesCreees = 0;
  let facturesDejaPresentes = 0;
  let compteurReference = 0;

  await mapLimit(lignes, 8, async (l) => {
    try {
      const contactId = contactIdByEmail.get(l.email)!;
      const courseId = courseIdByTitle.get(l.courseTitle)!;
      const sessionId = sessionIdByCle.get(cleSession(courseId, l.startsAt))!;

      const dossierExistant = await prisma.dossier.findFirst({
        where: { contactId, sessionId },
        select: { id: true },
      });
      let dossierId: string;
      if (dossierExistant) {
        dossierId = dossierExistant.id;
        dossiersDejaPresents++;
      } else {
        // Volontairement écrit ici plutôt que via createDossier() : ce
        // dernier interroge les recueils de besoins ligne par ligne (N+1
        // sur mille lignes) et enregistre un évènement « premier dossier
        // créé » — faux pour une reprise de 2022. Surtout, il ne sait pas
        // antidater, et c'est tout l'objet de cet import.
        const dossier = await prisma.dossier.create({
          data: {
            organizationId,
            contactId,
            sessionId,
            learnerCategory: l.category,
            // Antidaté à la formation. Deux effets, tous deux voulus : la
            // fiche ne prétend pas que l'inscription date d'aujourd'hui, et
            // les tâches « dossier à compléter » du tableau de bord, qui
            // sont bornées par createdAt, ne se déclenchent pas sur un
            // historique dont personne n'ira signer la convention.
            createdAt: l.startsAt,
          },
          select: { id: true },
        });
        dossierId = dossier.id;
        dossiersCrees++;
      }

      if (l.amountCents == null) return;

      // La référence d'origine est conservée : c'est elle qui figure dans
      // la comptabilité de l'organisme. À défaut, une référence marquée
      // REPRISE- qui ne peut pas collider avec la numérotation vivante.
      // Cet import ne consomme JAMAIS invoiceNextNumber — la numérotation
      // en cours doit continuer là où l'ancien outil l'a laissée.
      const reference = l.invoiceReference || `REPRISE-${l.startsAt.getUTCFullYear()}-${++compteurReference}`;
      const factureExistante = await prisma.invoice.findFirst({
        where: { organizationId, reference },
        select: { id: true },
      });
      if (factureExistante) {
        facturesDejaPresentes++;
        return;
      }

      // Datée de son encaissement (ou de la fin de formation) : c'est
      // createdAt que computeBpfReport lit pour ventiler le chiffre
      // d'affaires par exercice.
      const dateFacture = l.paidAt ?? l.endsAt;
      const facture = await prisma.invoice.create({
        data: {
          organizationId,
          contactId,
          dossierId,
          reference,
          description: l.courseTitle,
          amountCents: l.amountCents,
          status: "PAID",
          fundingOrigin: l.fundingOrigin,
          createdAt: dateFacture,
        },
        select: { id: true },
      });

      // Le règlement est écrit ici, et non via recordInvoicePayment().
      // Cette fonction-là existe pour faire converger les canaux VIVANTS
      // (saisie manuelle, Stripe, rapprochement bancaire) : elle émet un
      // webhook « invoice.paid » et fait avancer l'opportunité au CRM.
      // Déclencher mille webhooks pour de l'argent encaissé il y a deux ans
      // serait faux. Une ligne de paiement historique est un fait
      // comptable, pas un évènement.
      //
      // Elle n'est pas facultative pour autant : les écrans de facturation
      // dérivent le « reste dû » de la somme des paiements, donc une
      // facture payée sans paiement s'afficherait intégralement due et
      // remonterait dans le rapprochement bancaire.
      await prisma.payment.create({
        data: {
          organizationId,
          invoiceId: facture.id,
          amountCents: l.amountCents,
          paidAt: dateFacture,
          method: "reprise",
          recordedByName: "Reprise d'historique",
        },
      });
      facturesCreees++;
    } catch (e) {
      console.error(`Import historique ligne ${l.line}:`, e);
      errors.push({ line: l.line, message: "Échec inattendu sur cette ligne." });
    }
  });

  errors.sort((a, b) => a.line - b.line);
  return NextResponse.json({
    totalRows: table.rows.length,
    contactsCrees,
    sessionsCreees,
    dossiersCrees,
    dossiersDejaPresents,
    facturesCreees,
    facturesDejaPresentes,
    errors,
  });
}

const VIDE = {
  contactsCrees: 0,
  sessionsCreees: 0,
  dossiersCrees: 0,
  dossiersDejaPresents: 0,
  facturesCreees: 0,
  facturesDejaPresentes: 0,
};
