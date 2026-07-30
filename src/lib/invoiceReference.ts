import { prisma } from "@/lib/prisma";

// Count-based, not max-based: references are free text and staff may have
// typed their own formats, so "count this year + 1" is the least surprising
// continuation. A collision is cosmetic (no unique constraint), not fatal.
//
// Extracted from the funding-invoice route the day contract instalments
// started needing references too — one numbering scheme, not one per caller.
export async function nextInvoiceReference(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } },
  });
  return `FAC-${year}-${String(count + 1).padStart(3, "0")}`;
}
