/**
 * Jeu de données à l'échelle d'un gros organisme — LOCAL UNIQUEMENT.
 *
 * Raison d'être : l'audit « un OFP de 4000+ apprenants peut-il migrer sur
 * Jalon ? » ne se répond pas en lisant le code. Une requête sans `take:`
 * est invisible sur vingt lignes de démo et rend un écran inutilisable sur
 * dix mille. Ce script fabrique le volume pour qu'on mesure au lieu de
 * supposer.
 *
 *   npx tsx prisma/seed-volume.ts            # 4000 apprenants
 *   npx tsx prisma/seed-volume.ts 1000       # échelle réduite
 *   npx tsx prisma/seed-volume.ts --purge    # retire tout ce qu'il a créé
 *
 * Tout ce qu'il écrit est marqué (préfixe VOL- sur les identifiants, email
 * en @volume-test.local) pour que --purge n'emporte jamais les données de
 * démo qui cohabitent dans la même base.
 *
 * Refus explicite de tourner ailleurs qu'en local : la protection est dans
 * l'URL de connexion, pas dans une consigne d'usage.
 */
import { PrismaClient, PipelineStage } from "@prisma/client";

const prisma = new PrismaClient();

const MARQUEUR = "VOL-";
const DOMAINE = "volume-test.local";

const PRENOMS = ["Marie", "Thomas", "Sophie", "Julien", "Camille", "Nicolas", "Léa", "Antoine", "Chloé", "Maxime", "Emma", "Lucas", "Sarah", "Hugo", "Manon", "Théo", "Inès", "Nathan", "Jade", "Enzo"];
const NOMS = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier"];
const OBJETS = [
  "Demande de devis formation",
  "Re: Inscription session septembre",
  "Question sur le financement OPCO",
  "Convocation reçue, merci",
  "Report de ma session",
  "Attestation de fin de formation",
];

function estLocal(url: string | undefined): boolean {
  if (!url) return false;
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

// Déterministe : pas de Math.random(), pour que deux exécutions produisent
// le même jeu et qu'une mesure soit comparable à la précédente.
function pioche<T>(liste: T[], i: number): T {
  return liste[i % liste.length];
}

async function purge(organizationId: string) {
  // Le nettoyage part des contacts, pas des marqueurs. Une première version
  // supprimait chaque table par son préfixe VOL- : elle laissait derrière
  // elle tout ce que l'APPLICATION avait créé sur ces contacts depuis —
  // une relance envoyée pendant un test, un document généré — et la
  // suppression des contacts partait alors en violation de clé étrangère.
  // Ce que le script a écrit n'est pas ce qui existe.
  const contactsCibles = await prisma.contact.findMany({
    where: { organizationId, email: { endsWith: `@${DOMAINE}` } },
    select: { id: true },
  });
  const contactIds = contactsCibles.map((c) => c.id);
  if (contactIds.length === 0) {
    console.log("Purge : rien à retirer.");
    return;
  }
  const lien = { contactId: { in: contactIds } };

  // Ordre imposé par les clés étrangères : les enfants d'abord. Les enfants
  // de Dossier (progression LMS, émargements…) partent en cascade avec lui.
  const relances = await prisma.clientOutreach.deleteMany({ where: lien });
  // Les emails se rattrapent aussi par l'expéditeur : un message non
  // rattaché a un contactId nul et échapperait au lien.
  const emails = await prisma.emailMessage.deleteMany({
    where: { organizationId, OR: [lien, { fromAddress: { endsWith: `@${DOMAINE}` } }] },
  });
  const recueils = await prisma.needsAssessmentRequest.deleteMany({ where: lien });
  const documents = await prisma.document.deleteMany({ where: lien });
  const factures = await prisma.invoice.deleteMany({ where: lien });
  const devis = await prisma.quote.deleteMany({ where: lien });
  const opportunites = await prisma.opportunity.deleteMany({ where: lien });
  const dossiers = await prisma.dossier.deleteMany({ where: lien });
  const contacts = await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  console.log("Purge :", {
    relances: relances.count,
    emails: emails.count,
    recueils: recueils.count,
    documents: documents.count,
    factures: factures.count,
    devis: devis.count,
    opportunites: opportunites.count,
    dossiers: dossiers.count,
    contacts: contacts.count,
  });
}

async function main() {
  if (!estLocal(process.env.DATABASE_URL)) {
    console.error("Refus : DATABASE_URL ne pointe pas sur une base locale. Ce script fabrique des milliers de lignes de test.");
    process.exit(1);
  }

  const organization = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!organization) {
    console.error("Aucune organisation en base — lancez d'abord `npm run prisma:seed`.");
    process.exit(1);
  }
  console.log(`Organisation : ${organization.name} (${organization.id})`);

  if (process.argv.includes("--purge")) {
    await purge(organization.id);
    return;
  }

  const cible = Number.parseInt(process.argv[2] ?? "4000", 10);
  if (!Number.isInteger(cible) || cible < 1) {
    console.error("Nombre d'apprenants invalide.");
    process.exit(1);
  }

  // Les dossiers ont besoin d'une session existante : on réutilise celles du
  // jeu de démo plutôt que d'en inventer, pour rester au plus près de ce que
  // l'application manipule vraiment.
  const sessions = await prisma.session.findMany({ where: { organizationId: organization.id }, select: { id: true } });
  if (sessions.length === 0) {
    console.error("Aucune session en base — lancez d'abord `npm run prisma:seed`.");
    process.exit(1);
  }
  const utilisateur = await prisma.user.findFirstOrThrow({ where: { organizationId: organization.id }, select: { id: true } });

  console.time("total");

  // createMany par lots : une insertion par ligne mettrait des minutes, et
  // ce n'est pas ce qu'on cherche à mesurer.
  const LOT = 500;
  console.log(`Création de ${cible} contacts…`);
  for (let debut = 0; debut < cible; debut += LOT) {
    const lot = Array.from({ length: Math.min(LOT, cible - debut) }, (_, k) => {
      const i = debut + k;
      return {
        organizationId: organization.id,
        firstName: pioche(PRENOMS, i),
        lastName: pioche(NOMS, Math.floor(i / PRENOMS.length)),
        email: `apprenant${i}@${DOMAINE}`,
        phone: `06${String(10_000_000 + i).slice(0, 8)}`,
        defaultLearnerCategory: pioche(["employee", "jobseeker", "individual", "apprentice"], i),
        // Un tiers d'archivés : un organisme ancien traîne surtout des
        // dossiers clos, et c'est justement ce qui fait grossir les listes.
        archivedAt: i % 3 === 0 ? new Date(2024, i % 12, 1 + (i % 28)) : null,
        createdAt: new Date(2024 + (i % 3), i % 12, 1 + (i % 28)),
      };
    });
    await prisma.contact.createMany({ data: lot, skipDuplicates: true });
    process.stdout.write(`\r  ${Math.min(debut + LOT, cible)}/${cible}`);
  }
  console.log();

  const contacts = await prisma.contact.findMany({
    where: { organizationId: organization.id, email: { endsWith: `@${DOMAINE}` } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${contacts.length} contacts en base.`);

  console.log("Création des dossiers (1 à 3 par apprenant)…");
  const dossiers: { organizationId: string; contactId: string; sessionId: string; createdAt: Date }[] = [];
  contacts.forEach((contact, i) => {
    const nb = 1 + (i % 3);
    for (let d = 0; d < nb; d++) {
      dossiers.push({
        organizationId: organization.id,
        contactId: contact.id,
        sessionId: pioche(sessions, i + d).id,
        createdAt: new Date(2024 + ((i + d) % 3), (i + d) % 12, 1 + ((i + d) % 28)),
      });
    }
  });
  for (let debut = 0; debut < dossiers.length; debut += LOT) {
    await prisma.dossier.createMany({ data: dossiers.slice(debut, debut + LOT) });
    process.stdout.write(`\r  ${Math.min(debut + LOT, dossiers.length)}/${dossiers.length}`);
  }
  console.log();

  console.log("Création des factures (1 par dossier)…");
  const dossiersEnBase = await prisma.dossier.findMany({
    where: { organizationId: organization.id, contact: { email: { endsWith: `@${DOMAINE}` } } },
    select: { id: true, contactId: true, createdAt: true },
  });
  for (let debut = 0; debut < dossiersEnBase.length; debut += LOT) {
    const lot = dossiersEnBase.slice(debut, debut + LOT).map((d, k) => {
      const i = debut + k;
      return {
        organizationId: organization.id,
        contactId: d.contactId,
        dossierId: d.id,
        reference: `${MARQUEUR}${String(i + 1).padStart(6, "0")}`,
        description: "Formation professionnelle",
        amountCents: 80_000 + (i % 40) * 5_000,
        dueDate: new Date(d.createdAt.getTime() + 30 * 86_400_000),
        fundingOrigin: pioche(["company", "opco", "public", "individual"], i),
        createdAt: d.createdAt,
      };
    });
    await prisma.invoice.createMany({ data: lot, skipDuplicates: true });
    process.stdout.write(`\r  ${Math.min(debut + LOT, dossiersEnBase.length)}/${dossiersEnBase.length}`);
  }
  console.log();

  console.log("Création des opportunités (1 pour 4 apprenants)…");
  const etapes = [PipelineStage.PROSPECT, PipelineStage.QUOTE_SENT, PipelineStage.CONTRACT_SIGNED, PipelineStage.SESSION_SCHEDULED, PipelineStage.COMPLETED];
  const opportunites = contacts
    .filter((_, i) => i % 4 === 0)
    .map((contact, i) => ({
      organizationId: organization.id,
      contactId: contact.id,
      label: `${MARQUEUR}Opportunité ${i + 1}`,
      amountCents: 120_000 + (i % 20) * 10_000,
      stage: pioche(etapes, i),
      ownerId: utilisateur.id,
    }));
  for (let debut = 0; debut < opportunites.length; debut += LOT) {
    await prisma.opportunity.createMany({ data: opportunites.slice(debut, debut + LOT) });
  }
  console.log(`  ${opportunites.length} opportunités.`);

  console.log("Création des emails (5 par apprenant, dont 1 non trié)…");
  const emails: {
    organizationId: string;
    contactId: string | null;
    fromAddress: string;
    fromName: string;
    subject: string;
    snippet: string;
    body: string;
    receivedAt: Date;
    direction: string;
  }[] = [];
  contacts.forEach((contact, i) => {
    for (let e = 0; e < 5; e++) {
      emails.push({
        organizationId: organization.id,
        // Le 5e reste non rattaché : c'est lui qui alimente la file de
        // triage, l'écran le plus exposé au volume.
        contactId: e === 4 ? null : contact.id,
        fromAddress: `apprenant${i}@${DOMAINE}`,
        fromName: `${pioche(PRENOMS, i)} ${pioche(NOMS, Math.floor(i / PRENOMS.length))}`,
        subject: pioche(OBJETS, i + e),
        snippet: "Bonjour, je me permets de revenir vers vous concernant…",
        body: "Bonjour,\n\nJe me permets de revenir vers vous concernant ma demande.\n\nCordialement",
        receivedAt: new Date(2025, (i + e) % 12, 1 + ((i + e) % 28)),
        direction: "in",
      });
    }
  });
  for (let debut = 0; debut < emails.length; debut += LOT) {
    await prisma.emailMessage.createMany({ data: emails.slice(debut, debut + LOT) });
    process.stdout.write(`\r  ${Math.min(debut + LOT, emails.length)}/${emails.length}`);
  }
  console.log();

  console.timeEnd("total");
  console.log("\nVolume en base :");
  for (const [nom, n] of [
    ["Contact", await prisma.contact.count({ where: { organizationId: organization.id } })],
    ["Dossier", await prisma.dossier.count({ where: { organizationId: organization.id } })],
    ["Invoice", await prisma.invoice.count({ where: { organizationId: organization.id } })],
    ["Opportunity", await prisma.opportunity.count({ where: { organizationId: organization.id } })],
    ["EmailMessage", await prisma.emailMessage.count({ where: { organizationId: organization.id } })],
  ] as const) {
    console.log(`  ${nom.padEnd(14)} ${n}`);
  }
  console.log("\nPour tout retirer : npx tsx prisma/seed-volume.ts --purge");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
