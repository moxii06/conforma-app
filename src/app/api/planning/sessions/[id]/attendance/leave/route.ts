import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeLearnerAttendance, recordLeave } from "@/lib/attendance";

const schema = z.object({ dossierId: z.string().min(1) });

// Called both on a normal unmount and from a `navigator.sendBeacon` on tab
// close (see VirtualClassRoom.tsx) — sendBeacon requests have no custom
// headers, so this must accept a plain POST body over Content-Type
// text/plain the same as JSON, which `request.json()` already tolerates.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const auth = await authorizeLearnerAttendance(params.id, parsed.data.dossierId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const attendance = await recordLeave({ sessionId: params.id, dossierId: parsed.data.dossierId });
  return NextResponse.json(attendance ?? { ok: true });
}
