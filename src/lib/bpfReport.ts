import { prisma } from "@/lib/prisma";

export type BpfReport = {
  year: number;
  byCategory: { category: string; learnerCount: number; hours: number }[];
  byFunding: { origin: string; amountCents: number }[];
  totalLearners: number;
  totalHours: number;
  totalRevenueCents: number;
};

// Computed from data already in the system (sessions, dossiers, invoices),
// per spec §5.13 — "not a new data-entry workflow." Filters on the
// session's start date for the learner/hours side and the invoice's
// creation date for the revenue side, both within the selected calendar
// year.
export async function computeBpfReport(organizationId: string, year: number): Promise<BpfReport> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const [dossiers, invoices] = await Promise.all([
    prisma.dossier.findMany({
      where: { organizationId, session: { startsAt: { gte: yearStart, lt: yearEnd } } },
      include: { session: true },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: "PAID", createdAt: { gte: yearStart, lt: yearEnd } },
    }),
  ]);

  const categoryMap = new Map<string, { learnerCount: number; hours: number }>();
  for (const d of dossiers) {
    const key = d.learnerCategory ?? "unset";
    const hours = (d.session.endsAt.getTime() - d.session.startsAt.getTime()) / 3_600_000;
    const entry = categoryMap.get(key) ?? { learnerCount: 0, hours: 0 };
    entry.learnerCount += 1;
    entry.hours += hours;
    categoryMap.set(key, entry);
  }

  const fundingMap = new Map<string, number>();
  for (const inv of invoices) {
    const key = inv.fundingOrigin ?? "unset";
    fundingMap.set(key, (fundingMap.get(key) ?? 0) + inv.amountCents);
  }

  const byCategory = Array.from(categoryMap.entries()).map(([category, v]) => ({ category, ...v }));
  const byFunding = Array.from(fundingMap.entries()).map(([origin, amountCents]) => ({ origin, amountCents }));

  return {
    year,
    byCategory,
    byFunding,
    totalLearners: dossiers.length,
    totalHours: byCategory.reduce((s, c) => s + c.hours, 0),
    totalRevenueCents: byFunding.reduce((s, f) => s + f.amountCents, 0),
  };
}
