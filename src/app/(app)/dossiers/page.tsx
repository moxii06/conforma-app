import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

export default async function DossiersPage() {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "dossiers") === "none") redirect("/dashboard");
  // Spec §2: "Trainer: their own sessions" extends to the dossiers enrolled
  // in those sessions — a trainer manages their own learners, not the
  // whole org's.
  const ownerFilter = role === Role.TRAINER ? { session: { trainerId: userId } } : {};

  const dossiers = await prisma.dossier.findMany({
    where: { organizationId, ...ownerFilter },
    include: { contact: true, session: { include: { course: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <PageHeader title="Dossiers apprenants" subtitle="Un dossier = un contact inscrit à une session" />
      <div className="p-8 flex flex-col gap-2">
        {dossiers.map((d) => (
          <Link
            key={d.id}
            href={`/dossiers/${d.id}`}
            className="bg-white border border-line rounded-card px-4.5 py-3.5 flex items-center gap-4 text-[13px] text-ink hover:border-ink-soft"
          >
            <div className="flex-1">
              {d.contact.firstName} {d.contact.lastName}
            </div>
            <div className="text-slate">{d.session.course.title}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
