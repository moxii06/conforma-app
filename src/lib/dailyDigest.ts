import { prisma } from "@/lib/prisma";
import { can } from "@/lib/tenant";
import { getDashboardTasks } from "@/lib/dashboardTasks";
import { sendTransactionalEmail } from "@/lib/brevo";

const MAX_ITEMS_IN_EMAIL = 15;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Client feedback: the dashboard's "À faire" list is already recomputed
// live on every page load, but that only helps if someone actually opens
// the app that day — nothing pushed a reminder before, so a relance or a
// deadline could slip past unnoticed. This pushes the exact same
// per-user, role-scoped list getDashboardTasks() already builds for the
// dashboard/notification bell straight to each user's inbox instead, once
// a day, and only when they actually have something pending.
export async function sendDailyDigests(origin: string): Promise<{ sent: number }> {
  const users = await prisma.user.findMany({
    where: { status: "active" },
    select: { id: true, organizationId: true, email: true, name: true, role: true },
  });

  let sent = 0;
  for (const user of users) {
    if (can(user.role, "dashboard") === "none") continue;

    const tasks = await getDashboardTasks(user.organizationId, user.role, user.id);
    if (tasks.length === 0) continue;

    const shown = tasks.slice(0, MAX_ITEMS_IN_EMAIL);
    const remaining = tasks.length - shown.length;
    const overdueCount = tasks.filter((t) => t.overdue).length;
    const plural = tasks.length > 1 ? "s" : "";

    const text =
      `Bonjour ${user.name},\n\n` +
      `Vous avez ${tasks.length} tâche${plural} en attente sur Jalon${overdueCount > 0 ? ` (dont ${overdueCount} en retard)` : ""} :\n\n` +
      shown.map((t) => `- ${t.overdue ? "[EN RETARD] " : ""}${t.label} — ${t.contactName}`).join("\n") +
      (remaining > 0 ? `\n… et ${remaining} autre${remaining > 1 ? "s" : ""}.` : "") +
      `\n\nVoir le détail : ${origin}/dashboard\n`;

    const html =
      `<p>Bonjour ${escapeHtml(user.name)},</p>` +
      `<p>Vous avez <strong>${tasks.length}</strong> tâche${plural} en attente sur Jalon` +
      `${overdueCount > 0 ? ` (dont <strong>${overdueCount}</strong> en retard)` : ""} :</p>` +
      `<ul>${shown
        .map((t) => `<li>${t.overdue ? "<strong>[EN RETARD]</strong> " : ""}${escapeHtml(t.label)} — ${escapeHtml(t.contactName)}</li>`)
        .join("")}</ul>` +
      (remaining > 0 ? `<p>… et ${remaining} autre${remaining > 1 ? "s" : ""}.</p>` : "") +
      `<p><a href="${origin}/dashboard">Voir le détail sur Jalon</a></p>`;

    try {
      await sendTransactionalEmail({
        to: user.email,
        toName: user.name,
        subject: `Jalon — ${tasks.length} tâche${plural} à traiter${overdueCount > 0 ? " (dont des retards)" : ""}`,
        text,
        html,
        senderName: "Jalon",
      });
      sent++;
    } catch {
      // Non-fatal — one bad address or a transient Brevo error shouldn't
      // block the digest for every other user in every other org.
    }
  }

  return { sent };
}
