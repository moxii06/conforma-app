import { NextResponse } from "next/server";
import { clearPlatformAdminCookie } from "@/lib/platformAdmin";

export async function POST() {
  await clearPlatformAdminCookie();
  return NextResponse.json({ ok: true });
}
