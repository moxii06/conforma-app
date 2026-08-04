import { prisma } from "@/lib/prisma";
import { formatInvoiceReference } from "@/lib/invoiceNumberFormat";

// Deux régimes, selon que l'organisme a réglé sa numérotation ou non.
//
// Réglé (invoicePrefix + invoiceNextNumber renseignés) : la séquence de
// l'organisme fait foi. Le numéro est alloué par un UPDATE atomique, donc
// deux factures créées en même temps ne peuvent pas recevoir le même —
// c'est le but, l'article 242 nonies A du CGI impose une séquence
// chronologique continue, et un doublon est un vrai problème comptable.
//
// Non réglé : comportement historique, FAC-<année>-<nombre de factures de
// l'année + 1>. Conservé pour ne pas renuméroter sous les pieds d'un
// organisme déjà en route ; il bascule sur sa propre séquence le jour où
// il la règle.
export async function nextInvoiceReference(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { invoicePrefix: true, invoiceNextNumber: true },
  });

  if (organization.invoicePrefix !== null && organization.invoiceNextNumber !== null) {
    // update renvoie la valeur APRÈS incrément : le numéro attribué à cette
    // facture est donc celui d'avant.
    const apres = await prisma.organization.update({
      where: { id: organizationId },
      data: { invoiceNextNumber: { increment: 1 } },
      select: { invoicePrefix: true, invoiceNextNumber: true },
    });
    return formatInvoiceReference(apres.invoicePrefix ?? "", (apres.invoiceNextNumber ?? 1) - 1);
  }

  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } },
  });
  return `FAC-${year}-${String(count + 1).padStart(3, "0")}`;
}
