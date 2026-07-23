import { PrismaClient } from "@prisma/client";
import { seedBase } from "./lib/seed-base";

const prisma = new PrismaClient();

seedBase(prisma)
  .then(({ org, admin, dossier }) => {
    console.log("Seed complete:", { org: org.id, admin: admin.email, dossier: dossier.id });
    console.log("Login with any seeded user email above and password: conforma2026");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
