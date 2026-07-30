import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { privateStoreToken } from "@/lib/storage";

// TEMPORARY — one-shot migration of the files uploaded before the private
// store existed (see the private-blob section of the README). They live in
// `conforma-lms` (public): their URL alone grants access, permanently, to
// anyone who has it, and that cannot be revoked because a store's access mode
// is fixed at creation. Copying them into `conforma-prive` and deleting the
// originals is the only way to close it for those files.
//
// Delete this route once the counts come back zero — it is deliberately not
// part of the product.
//
// Gated on an ADMIN_OF session rather than a secret header (the pattern the
// old seed-demo route used) so no new credential has to be created for a
// route measured in minutes. It is global, not org-scoped, because the
// problem is global; that mismatch is acceptable only because this is torn
// out immediately after use.
//
// NOT migrated, on purpose:
//   - Organization.logoUrl (`branding/…`) — rendered as <img src> on the
//     public token pages (/catalogue, /activation, /satisfaction,
//     /formulaire), which have no session to authenticate with.
//   - email signature logos (`signatures/…`) — fetched by the recipient's
//     mail client, which likewise has no session.
// Both are brand marks, not personal data, so public is the correct mode for
// them, and it is why the old store is kept rather than deleted.

const PUBLIC_STORE_MARKER = ".public.blob.vercel-storage.com";

// One HTTP call handles a slice, not the whole set: the function has a wall
// clock and the largest of these is a video. The caller repeats until
// `remaining` is 0.
const DEFAULT_BATCH = 5;

type Holder = { table: string; id: string; fileUrl: string };

async function collectLegacyRows(): Promise<Holder[]> {
  const [documents, modules, attachments, versions] = await Promise.all([
    prisma.document.findMany({
      where: { fileUrl: { contains: PUBLIC_STORE_MARKER } },
      select: { id: true, fileUrl: true },
    }),
    prisma.elearningModule.findMany({
      where: { fileUrl: { contains: PUBLIC_STORE_MARKER } },
      select: { id: true, fileUrl: true },
    }),
    prisma.elearningModuleAttachment.findMany({
      where: { fileUrl: { contains: PUBLIC_STORE_MARKER } },
      select: { id: true, fileUrl: true },
    }),
    prisma.elearningModuleVersion.findMany({
      where: { fileUrl: { contains: PUBLIC_STORE_MARKER } },
      select: { id: true, fileUrl: true },
    }),
  ]);

  return [
    ...documents.map((r) => ({ table: "Document", id: r.id, fileUrl: r.fileUrl! })),
    ...modules.map((r) => ({ table: "ElearningModule", id: r.id, fileUrl: r.fileUrl! })),
    ...attachments.map((r) => ({ table: "ElearningModuleAttachment", id: r.id, fileUrl: r.fileUrl })),
    ...versions.map((r) => ({ table: "ElearningModuleVersion", id: r.id, fileUrl: r.fileUrl! })),
  ];
}

async function repoint(table: string, id: string, fileUrl: string): Promise<void> {
  if (table === "Document") await prisma.document.update({ where: { id }, data: { fileUrl } });
  else if (table === "ElearningModule") await prisma.elearningModule.update({ where: { id }, data: { fileUrl } });
  else if (table === "ElearningModuleAttachment")
    await prisma.elearningModuleAttachment.update({ where: { id }, data: { fileUrl } });
  else if (table === "ElearningModuleVersion")
    await prisma.elearningModuleVersion.update({ where: { id }, data: { fileUrl } });
}

// The pathname the blob had in the old store, so the new one stays readable
// to a human browsing the store. The trailing `-<random>` Vercel appended on
// the original upload is dropped — put() adds a fresh one, and keeping both
// would stack a second suffix on every migrated file.
function targetPathname(fileUrl: string): string {
  const path = decodeURIComponent(new URL(fileUrl).pathname).replace(/^\/+/, "");
  return path.replace(/-[A-Za-z0-9]{20,}(\.[^.]+)?$/, (_m, ext: string | undefined) => ext ?? "");
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Réservé à l'administrateur de l'organisme." }, { status: 403 });
  }

  const token = privateStoreToken();
  if (!token) return NextResponse.json({ error: "BLOB_PRIVATE_READ_WRITE_TOKEN absent." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; batch?: number };
  const batch = Math.min(Math.max(body.batch ?? DEFAULT_BATCH, 1), 25);

  const rows = await collectLegacyRows();
  // Several rows can point at one blob (a module and the version row
  // recording that same upload). Move the bytes once, then repoint every
  // row that referenced them — otherwise the second row's fetch would 404 on
  // a blob the first pass already deleted.
  const byUrl = new Map<string, Holder[]>();
  for (const row of rows) {
    const group = byUrl.get(row.fileUrl);
    if (group) group.push(row);
    else byUrl.set(row.fileUrl, [row]);
  }

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      blobs: byUrl.size,
      rows: rows.length,
      sample: [...byUrl.keys()].slice(0, 10).map((u) => targetPathname(u)),
    });
  }

  const migrated: { pathname: string; rows: number }[] = [];
  const failed: { fileUrl: string; error: string }[] = [];

  for (const [oldUrl, group] of [...byUrl.entries()].slice(0, batch)) {
    try {
      // The old store is public, so a plain fetch is all it takes to read the
      // bytes — the very property being removed here.
      const upstream = await fetch(oldUrl);
      if (!upstream.ok) throw new Error(`lecture ${upstream.status}`);
      const buffer = Buffer.from(await upstream.arrayBuffer());

      const blob = await put(targetPathname(oldUrl), buffer, {
        access: "private",
        addRandomSuffix: true,
        contentType: upstream.headers.get("content-type") ?? undefined,
        token,
      });

      // Repoint before deleting: a crash between the two leaves a duplicate
      // (harmless, costs storage) rather than a row pointing at nothing.
      for (const row of group) await repoint(row.table, row.id, blob.url);
      await del(oldUrl);

      migrated.push({ pathname: targetPathname(oldUrl), rows: group.length });
    } catch (e) {
      failed.push({ fileUrl: oldUrl, error: e instanceof Error ? e.message : "erreur inconnue" });
    }
  }

  return NextResponse.json({
    migrated: migrated.length,
    rowsRepointed: migrated.reduce((n, m) => n + m.rows, 0),
    remaining: byUrl.size - migrated.length,
    details: migrated,
    failed,
  });
}
