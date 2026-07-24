import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// TEMPORARY — one-shot endpoint to apply pending Prisma migrations against
// whichever database DATABASE_URL points at, without ever exposing that
// connection string (same reasoning as the now-removed /api/admin/seed-demo
// route). Runs each migration's raw SQL through the server's own Prisma
// Client, then records it in _prisma_migrations so a future `prisma migrate
// deploy` from a machine with real DB access sees it as already applied
// and doesn't try to re-run it. Guarded by a secret header — remove this
// route (and the MIGRATE_PROD_SECRET env var) once confirmed applied.
const MIGRATIONS = [
  "20260724065915_course_subcontractors_automation_rules",
  "20260724084158_company_responsable_info",
  "20260724073018_automation_rule_email_triggers",
];

export async function POST(request: Request) {
  const expected = process.env.MIGRATE_PROD_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "MIGRATE_PROD_SECRET non configuré." }, { status: 503 });
  }
  const provided = request.headers.get("x-migrate-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const applied: string[] = [];
  try {
    for (const name of MIGRATIONS) {
      const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`,
        name
      );
      if (existing.length > 0) {
        continue;
      }

      const sqlPath = join(process.cwd(), "prisma", "migrations", name, "migration.sql");
      const sql = readFileSync(sqlPath, "utf-8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      await prisma.$transaction(async (tx) => {
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, now(), 1)`,
          randomUUID(),
          checksum,
          name
        );
      });
      applied.push(name);
    }
    return NextResponse.json({ ok: true, applied, alreadyApplied: MIGRATIONS.filter((m) => !applied.includes(m)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue.", applied }, { status: 500 });
  }
}
