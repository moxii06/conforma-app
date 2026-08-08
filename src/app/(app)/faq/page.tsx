import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { FaqBrowser } from "@/components/FaqBrowser";
import { FAQ_CATEGORIES } from "@/lib/faqContent";

export default async function FaqPage() {
  const { role, roles } = await requireSessionContext();
  if (can(roles, "faq") === "none") redirect("/dashboard");

  // Every role can open this page (see the "faq" row in PERMISSIONS), so
  // without this filter a learner would get a page made entirely of guides
  // for screens they get redirected away from. Gate each category on the
  // permission its screens actually use.
  const visibleKeys = FAQ_CATEGORIES.filter((category) => {
    if (can(roles, category.feature) === "none") return false;
    // "planning" is `limited` for LEARNER, which is what lets them reach
    // their own course list — but it would also hand them the staff guides
    // for the catalogue and the session planner. Excluded explicitly rather
    // than inferred from the access level.
    if (category.staffOnly && role === Role.LEARNER) return false;
    if (category.learnerOnly && role !== Role.LEARNER) return false;
    return true;
  }).map((category) => category.key);

  return (
    <>
      <PageHeader title="FAQ & guides" subtitle="Comment faire, module par module" />
      {/* The starter path is account setup — organisation details, team
          invites, first course, integrations. Every step of it is an
          ADMIN_OF action, so showing it to anyone else is a list of things
          they can't do, with links to categories they can't see. */}
      <FaqBrowser visibleKeys={visibleKeys} showStarter={role === Role.ADMIN_OF} />
    </>
  );
}
