import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";

// Shared by the join/ping/leave routes — only the learner whose own dossier
// this is may record their own attendance (this IS the "real connection,
// not a checkbox" signal, so it has to come from the learner's own browser
// session, not staff acting on their behalf).
export async function authorizeLearnerAttendance(sessionId: string, dossierId: string) {
  const auth = await getSessionContext();
  if (!auth) return { error: "Non authentifié.", status: 401 as const };

  const classSession = await prisma.session.findFirst({ where: { id: sessionId, organizationId: auth.organizationId } });
  if (!classSession) return { error: "Session introuvable.", status: 404 as const };
  if (classSession.format !== "REMOTE" && classSession.format !== "HYBRID") {
    return { error: "Cette session n'a pas de classe virtuelle.", status: 400 as const };
  }

  const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, sessionId: classSession.id } });
  if (!dossier) return { error: "Dossier introuvable pour cette session.", status: 404 as const };
  if (dossier.learnerUserId !== auth.userId) {
    return { error: "Action non autorisée.", status: 403 as const };
  }

  return { classSession, dossier };
}

// Heartbeats fire every ~30s from the room page (see VirtualClassRoom.tsx).
// Capping the per-tick delta at 90s means a laptop that slept and resumed
// (or a tab that was backgrounded) can't silently credit someone with hours
// of "presence" they weren't actually connected for.
const PING_CAP_SECONDS = 90;

function elapsedSeconds(from: Date, to: Date) {
  return Math.min(PING_CAP_SECONDS, Math.max(0, (to.getTime() - from.getTime()) / 1000));
}

export async function recordJoin(params: { sessionId: string; dossierId: string }) {
  const now = new Date();
  return prisma.virtualClassAttendance.upsert({
    where: { sessionId_dossierId: params },
    update: { lastPingAt: now, leftAt: null },
    create: { sessionId: params.sessionId, dossierId: params.dossierId, joinedAt: now, lastPingAt: now },
  });
}

export async function recordPing(params: { sessionId: string; dossierId: string }) {
  const now = new Date();
  const existing = await prisma.virtualClassAttendance.findUnique({ where: { sessionId_dossierId: params } });
  if (!existing) return recordJoin(params);
  return prisma.virtualClassAttendance.update({
    where: { id: existing.id },
    data: { lastPingAt: now, leftAt: null, durationSeconds: existing.durationSeconds + Math.round(elapsedSeconds(existing.lastPingAt, now)) },
  });
}

export async function recordLeave(params: { sessionId: string; dossierId: string }) {
  const now = new Date();
  const existing = await prisma.virtualClassAttendance.findUnique({ where: { sessionId_dossierId: params } });
  if (!existing) return null;
  return prisma.virtualClassAttendance.update({
    where: { id: existing.id },
    data: { lastPingAt: now, leftAt: now, durationSeconds: existing.durationSeconds + Math.round(elapsedSeconds(existing.lastPingAt, now)) },
  });
}
