import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { OrgChartView } from "@/components/OrgChartView";
import { PrintButton } from "@/components/PrintButton";
import type { OrgChartGroups } from "@/lib/orgChart";

export default async function OrgChartSnapshotPage({ params }: { params: { id: string } }) {
  const session = await requireSessionContext();
  if (can(session.role, "team") !== "full") redirect("/dashboard");

  const [snapshot, organization] = await Promise.all([
    prisma.orgChartSnapshot.findFirst({ where: { id: params.id, organizationId: session.organizationId } }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
  ]);
  if (!snapshot) notFound();

  return (
    <>
      <PageHeader
        title={`Organigramme archivé — ${format(snapshot.createdAt, "d MMM yyyy, HH:mm", { locale: fr })}`}
        subtitle={`Archivé par ${snapshot.createdByName}`}
      />
      <div className="p-8 flex flex-col gap-5 max-w-3xl">
        <Link href="/team?tab=organigramme" className="text-[12px] text-slate hover:text-ink w-fit">
          ← Retour à l&apos;équipe
        </Link>
        <div className="bg-white border border-line rounded-card p-6">
          <div className="flex items-center justify-end mb-6 print:hidden">
            <PrintButton />
          </div>
          <OrgChartView organizationName={organization.name} groups={snapshot.data as unknown as OrgChartGroups} />
        </div>
      </div>
    </>
  );
}
