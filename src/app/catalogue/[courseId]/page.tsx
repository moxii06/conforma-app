import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BrandedLogo } from "@/components/BrandedLogo";
import { PublicEnrollmentForm } from "@/components/PublicEnrollmentForm";
import { PhoneLink } from "@/components/ui";

export async function generateMetadata(props: { params: Promise<{ courseId: string }> }): Promise<Metadata> {
  const params = await props.params;
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, isPublic: true, archivedAt: null },
    select: { title: true, organization: { select: { name: true } } },
  });
  return { title: course ? `${course.title} — ${course.organization.name}` : "Jalon" };
}

// The public course page — RNQ indicator 1's ten mandatory items on one
// URL the OF can put on its website, quotes and social posts. Opt-in
// (Course.isPublic) and never rendered for archived courses. The page is
// intentionally exhaustive-by-default: an empty prerequisites field
// renders an explicit "Sans prérequis" (the pilot's real 2022 NC was
// precisely the ABSENCE of that mention), and missing optional items
// render nothing rather than an empty heading.
export default async function PublicCoursePage(props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, isPublic: true, archivedAt: null },
    include: {
      organization: {
        include: { referentHandicapUser: { select: { name: true, email: true } } },
      },
      resultIndicators: { where: { published: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!course) notFound();

  const org = course.organization;
  const formatAmount = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  const items: { label: string; value: string }[] = [
    { label: "Prérequis", value: course.prerequisites || "Sans prérequis" },
    ...(course.durationHours != null ? [{ label: "Durée", value: `${course.durationHours} heures` }] : []),
    ...(course.priceCents != null ? [{ label: "Tarif", value: formatAmount(course.priceCents) }] : []),
    ...(course.accessDelay ? [{ label: "Délai d'accès", value: course.accessDelay }] : []),
    ...(course.accessModalities ? [{ label: "Modalités d'accès", value: course.accessModalities }] : []),
    ...(course.teachingMethods ? [{ label: "Méthodes mobilisées", value: course.teachingMethods }] : []),
    ...(course.evaluationModalities ? [{ label: "Modalités d'évaluation", value: course.evaluationModalities }] : []),
  ];

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <BrandedLogo name={org.name} logoUrl={org.logoUrl} brandColor={org.brandColor} size={28} />

        <div className="bg-white border border-line rounded-card p-6">
          <h1 className="text-[22px] font-display text-ink mb-1.5">{course.title}</h1>
          {course.description && <p className="text-[13px] text-slate leading-relaxed">{course.description}</p>}
        </div>

        {/* Placed high on purpose: a visitor who has already decided
            shouldn't have to scroll past the whole indicator-1 sheet to act.
            Renders only when the OF opted in for this course. */}
        {(course.publicEnrollment === "request" || course.publicEnrollment === "direct") && (
          <PublicEnrollmentForm
            courseId={course.id}
            mode={course.publicEnrollment}
            brandColor={org.brandColor}
          />
        )}

        {course.objectives && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">Objectifs de la formation</div>
            <pre className="whitespace-pre-wrap text-[13px] text-ink font-sans leading-relaxed">{course.objectives}</pre>
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2.5">Informations pratiques</div>
          <div className="flex flex-col">
            {items.map((item) => (
              <div key={item.label} className="flex gap-3 py-2 border-t border-line first:border-t-0">
                <div className="w-44 shrink-0 text-[12px] text-slate">{item.label}</div>
                <div className="text-[13px] text-ink">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">
            Accessibilité aux personnes en situation de handicap
          </div>
          <p className="text-[13px] text-ink leading-relaxed">
            Nos formations sont ouvertes aux personnes en situation de handicap. Contactez-nous en amont pour étudier
            ensemble les aménagements possibles (pédagogie, rythme, supports, moyens techniques).
          </p>
          {org.referentHandicapUser && (
            <p className="text-[12.5px] text-slate mt-1.5">
              Référent handicap : {org.referentHandicapUser.name || org.referentHandicapUser.email} —{" "}
              <a href={`mailto:${org.referentHandicapUser.email}`} className="underline decoration-line hover:decoration-ink">
                {org.referentHandicapUser.email}
              </a>
            </p>
          )}
        </div>

        {course.resultIndicators.length > 0 && (
          <div className="bg-white border border-line rounded-card p-5">
            <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2.5">Résultats</div>
            {course.resultIndicators.map((ind) => (
              <div key={ind.id} className="py-2 border-t border-line first:border-t-0">
                <div className="text-[13px] text-ink">
                  <span className="font-semibold">{ind.computedValue != null ? `${ind.computedValue}%` : "—"}</span> — {ind.label}
                </div>
                <div className="text-[11.5px] text-slate mt-0.5">
                  Période : {new Date(ind.periodStart).toLocaleDateString("fr-FR")} au {new Date(ind.periodEnd).toLocaleDateString("fr-FR")}
                  {" · "}
                  Méthode : {ind.formula} ({ind.respondents}/{ind.totalPopulation} répondants)
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white border border-line rounded-card p-5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">Contact</div>
          <div className="text-[13px] text-ink">{org.name}</div>
          {org.publicContactEmail && (
            <div className="text-[12.5px] text-slate mt-0.5">
              <a href={`mailto:${org.publicContactEmail}`} className="underline decoration-line hover:decoration-ink">
                {org.publicContactEmail}
              </a>
            </div>
          )}
          {org.publicContactPhone && (
            <div className="text-[12.5px] text-slate mt-0.5">
              <PhoneLink phone={org.publicContactPhone} />
            </div>
          )}
          {(org.billingAddress || org.billingCity) && (
            <div className="text-[12.5px] text-slate mt-0.5">
              {[org.billingAddress, [org.billingPostalCode, org.billingCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate text-center pb-4">
          Fiche mise à jour le {new Date().toLocaleDateString("fr-FR")} — {org.name}
        </div>
      </div>
    </main>
  );
}
