import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { seedDemoData } from "./lib/seed-demo";

// Manually load .env — this script runs standalone via tsx, not through
// Next's own env bootstrap, and BLOB_READ_WRITE_TOKEN specifically isn't
// referenced anywhere in schema.prisma (only DATABASE_URL is, which
// Prisma's client loads on its own), so it can't be assumed present in
// process.env otherwise.
// .env.local overrides .env, same precedence Next.js itself uses — the
// real BLOB_READ_WRITE_TOKEN in this project lives in .env.local.
for (const file of [".env", ".env.local"]) {
  const envPath = path.join(__dirname, "..", file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const prisma = new PrismaClient();

seedDemoData(prisma)
  .then(({ password, accounts }) => {
    console.log("\nDémo peuplée avec succès.\n");
    console.log("Comptes (mot de passe pour tous : " + password + ") :");
    for (const a of accounts) {
      console.log(`  ${a.role.padEnd(15)} ${a.email}${a.note ? "   (" + a.note + ")" : ""}`);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
