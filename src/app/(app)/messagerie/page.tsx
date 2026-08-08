import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { MessagerieInterne } from "@/components/MessagerieInterne";

// La messagerie interne de l'équipe.
//
// À ne pas confondre avec /inbox, qui est la boîte mail : celle-ci reçoit les
// clients et les prospects depuis une vraie adresse, celle-là fait parler
// l'organisme avec lui-même et n'envoie aucun e-mail. Le sous-titre le dit à
// l'écran, parce que deux entrées voisines dans la navigation invitent
// naturellement à les confondre.
export default async function MessageriePage() {
  const { userId, roles } = await requireSessionContext();
  if (can(roles, "messagerie") === "none") redirect("/dashboard");

  const moi = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true } });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Messagerie interne"
        subtitle="Vos échanges avec l'équipe. Rien ne sort de l'organisme : aucun e-mail n'est envoyé."
      />
      <MessagerieInterne moi={moi} />
    </div>
  );
}
