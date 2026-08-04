// Le formatage seul, sans Prisma : l'écran de réglage
// (InvoiceNumberingForm, composant client) en a besoin pour son aperçu en
// direct, et il ne peut pas importer invoiceReference.ts qui tire la base.
// Une seule règle de composition, partagée, plutôt qu'un aperçu qui
// finirait par mentir sur ce que la facture portera vraiment.
//
// Le préfixe est repris tel quel : c'est l'organisme qui décide du
// séparateur et de la présence de l'année (« FAC-2026- », « 2026/F »).
export function formatInvoiceReference(prefix: string, numero: number): string {
  return `${prefix}${String(numero).padStart(3, "0")}`;
}
