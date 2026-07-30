import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { MigrateBlobsPanel } from "@/components/MigrateBlobsPanel";

// TEMPORARY — see the route it drives (/api/admin/migrate-blobs) for why this
// exists. Deliberately not in the Sidebar: it is reached by typing the URL,
// used once, and deleted along with the route.
export default async function MigrateBlobsPage() {
  const { role } = await requireSessionContext();
  if (role !== Role.ADMIN_OF) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <PageHeader
        title="Migration du stockage"
        subtitle="Déplace les fichiers antérieurs au store privé, dont l'URL publique reste sinon valable indéfiniment."
      />
      <MigrateBlobsPanel />
    </div>
  );
}
