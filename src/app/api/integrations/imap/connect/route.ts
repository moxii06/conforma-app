import { NextResponse } from "next/server";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { encrypt } from "@/lib/crypto";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().int().positive(),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().positive(),
});

// Generic IMAP/SMTP mailbox connection — covers any provider that doesn't
// offer OAuth (OVH, Ionos, Zoho, most small hosts...), at the cost of
// storing the account password (encrypted) instead of a revocable OAuth
// token. Both protocols are tested live before saving anything, so a typo
// or wrong host fails immediately with a clear error rather than silently
// breaking the next sync.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "integrations") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { email, password, imapHost, imapPort, smtpHost, smtpPort } = parsed.data;

  const imapClient = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: { user: email, pass: password },
    logger: false,
  });
  try {
    await imapClient.connect();
    await imapClient.logout();
  } catch {
    return NextResponse.json(
      { error: "Connexion IMAP impossible — vérifiez l'adresse, le mot de passe, l'hôte et le port." },
      { status: 400 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: email, pass: password },
  });
  try {
    await transporter.verify();
  } catch {
    return NextResponse.json(
      { error: "Connexion SMTP impossible — vérifiez l'hôte et le port (l'IMAP, lui, a fonctionné)." },
      { status: 400 }
    );
  }

  await prisma.mailboxConnection.upsert({
    where: { organizationId_provider: { organizationId: session.organizationId, provider: "imap" } },
    update: {
      accountEmail: email,
      passwordEncrypted: encrypt(password),
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
    },
    create: {
      organizationId: session.organizationId,
      provider: "imap",
      accountEmail: email,
      passwordEncrypted: encrypt(password),
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
    },
  });

  return NextResponse.json({ ok: true });
}
