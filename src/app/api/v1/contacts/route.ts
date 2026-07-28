import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, parsePaging } from "@/lib/apiAuth";

// GET /api/v1/contacts — learners and prospects.
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:contacts");
  if ("error" in auth) return auth.error;
  const { take, skip } = parsePaging(request);

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where: { organizationId: auth.context.organizationId } }),
    prisma.contact.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { company: { select: { id: true, name: true, siret: true } } },
    }),
  ]);

  return NextResponse.json({
    data: contacts.map((c) => ({
      id: c.id,
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      phone: c.phone,
      created_at: c.createdAt.toISOString(),
      company: c.company ? { id: c.company.id, name: c.company.name, siret: c.company.siret } : null,
    })),
    pagination: { total, limit: take, offset: skip },
  });
}
