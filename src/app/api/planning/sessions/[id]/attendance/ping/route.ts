import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeLearnerAttendance, recordPing } from "@/lib/attendance";

const schema = z.object({ dossierId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const auth = await authorizeLearnerAttendance(params.id, parsed.data.dossierId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const attendance = await recordPing({ sessionId: params.id, dossierId: parsed.data.dossierId });
  return NextResponse.json(attendance);
}
