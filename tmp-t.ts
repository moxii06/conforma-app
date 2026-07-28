import { prisma } from "./src/lib/prisma";
async function main() {
  const u = await prisma.user.findFirst({ where: { role: "TRAINER", status: "active" }, select: { email: true, name: true } });
  console.log(JSON.stringify(u));
}
main().catch((e) => console.error(e.message));
