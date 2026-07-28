import { prisma } from "./src/lib/prisma";
async function main() {
  const r = await prisma.integrationRequest.deleteMany({ where: { toolName: "Zoom" } });
  console.log("Lignes de test supprimees :", r.count);
  console.log("Restantes :", await prisma.integrationRequest.count());
}
main();
