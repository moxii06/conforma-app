import { prisma } from "@/lib/prisma";

export type BpfReport = {
  year: number;
  byCategory: { category: string; learnerCount: number; hours: number }[];
  byFunding: { origin: string; amountCents: number }[];
  totalLearners: number;
  totalHours: number;
  totalRevenueCents: number;
  /** Dossiers whose session hours could not be established (see
   *  resolveSessionHours). Their learners still count, their hours are 0,
   *  and the page warns rather than shipping a made-up number. */
  dossiersWithoutHours: number;
};

export type HoursSource = "days" | "course" | "unknown";

/**
 * How many training hours a session represents, for the BPF return.
 *
 * This used to be `(endsAt - startsAt)` — wall-clock elapsed time. A session
 * running Monday 9am to Wednesday 5pm declared 56 hours instead of 21, on a
 * legally binding annual declaration to the administration. There is no
 * amount of "close enough" that makes that acceptable, so there is
 * deliberately NO calendar fallback here: when neither real source is
 * available the answer is "unknown", and the caller surfaces it.
 *
 * Order matters. SessionDay hours are what the OF actually planned per
 * half-day (lunch already excluded), so they beat the course's nominal
 * duration whenever they exist — a session that ran short is declared short.
 */
export function resolveSessionHours(
  session: { days: { morningHours: number | null; afternoonHours: number | null }[] },
  course: { durationHours: number | null },
): { hours: number; source: HoursSource } {
  if (session.days.length > 0) {
    const hours = session.days.reduce((sum, d) => sum + (d.morningHours ?? 0) + (d.afternoonHours ?? 0), 0);
    // Days exist but every half-day is blank — treat as not filled in rather
    // than as a genuine zero-hour session.
    if (hours > 0) return { hours, source: "days" };
  }
  if (course.durationHours != null && course.durationHours > 0) {
    return { hours: course.durationHours, source: "course" };
  }
  return { hours: 0, source: "unknown" };
}

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
      include: { session: { include: { days: true, course: { select: { durationHours: true } } } } },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: "PAID", createdAt: { gte: yearStart, lt: yearEnd } },
    }),
  ]);

  const categoryMap = new Map<string, { learnerCount: number; hours: number }>();
  let dossiersWithoutHours = 0;
  for (const d of dossiers) {
    const key = d.learnerCategory ?? "unset";
    const { hours, source } = resolveSessionHours(d.session, d.session.course);
    if (source === "unknown") dossiersWithoutHours++;
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
    dossiersWithoutHours,
  };
}
