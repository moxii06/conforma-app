import { get } from "@vercel/blob";
import { privateStoreToken } from "@/lib/storage";

/**
 * Reads a stored file and returns it as a response, whatever its access mode.
 *
 * Uploads go to the private store now (see src/lib/storage.ts): the blob URL
 * on its own no longer grants access, so every read has to come through an
 * authenticated route that has already checked the caller may see this
 * particular record. Callers do that check; this only moves the bytes.
 *
 * The ~25 files uploaded before the switch still live in the old public
 * store. Rather than guess from the URL shape which store a file belongs to,
 * this tries the authenticated read first and falls back to a plain fetch —
 * correct for both, and it stays correct if Vercel ever changes how private
 * URLs look. The fallback is what keeps those older files working.
 *
 * Range support matters for video: without it the <video> element can't seek
 * without re-downloading, and Safari/iOS won't play at all.
 */
export async function streamStoredFile(
  fileUrl: string,
  options: { range?: string | null; fallbackContentType?: string; downloadName?: string } = {},
): Promise<Response> {
  const headers = new Headers();
  // These bytes are somebody's convention, CV or diploma — never let a shared
  // cache hold on to them.
  headers.set("Cache-Control", "private, no-store");
  headers.set("Accept-Ranges", "bytes");
  if (options.downloadName) {
    headers.set("Content-Disposition", contentDisposition(options.downloadName));
  }

  const privateRead = await readPrivate(fileUrl, options.range);
  if (privateRead) {
    headers.set("Content-Type", privateRead.contentType ?? options.fallbackContentType ?? "application/octet-stream");
    copyRangeHeaders(privateRead.headers, headers);
    return new Response(privateRead.stream, { status: privateRead.status, headers });
  }

  // Legacy public blob (uploaded before the switch): fetch it directly. Note
  // this proxying does NOT make those files private — their URL still works
  // for anyone who has it. It only stops the app from handing new copies of
  // that URL out. See the migration note in README.
  const upstream = await fetch(fileUrl, options.range ? { headers: { Range: options.range } } : undefined);
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "Fichier introuvable." }, { status: 502 });
  }
  headers.set("Content-Type", upstream.headers.get("content-type") ?? options.fallbackContentType ?? "application/octet-stream");
  copyRangeHeaders(upstream.headers, headers);
  return new Response(upstream.body, { status: upstream.status, headers });
}

// Byte-level counterpart to streamStoredFile, for callers that need the
// whole file in memory rather than piped into an HTTP Response — e.g.
// re-attaching an already-generated Document to an outgoing reply email.
// Same private-store-first, legacy-public-fallback logic.
export async function fetchStoredFileBuffer(
  fileUrl: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const privateRead = await readPrivate(fileUrl, null);
  if (privateRead) {
    const buffer = Buffer.from(await new Response(privateRead.stream).arrayBuffer());
    return { buffer, contentType: privateRead.contentType ?? "application/octet-stream" };
  }

  const upstream = await fetch(fileUrl);
  if (!upstream.ok || !upstream.body) return null;
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { buffer, contentType: upstream.headers.get("content-type") ?? "application/octet-stream" };
}

async function readPrivate(
  fileUrl: string,
  range?: string | null,
): Promise<{ stream: ReadableStream; headers: Headers; status: number; contentType?: string } | null> {
  // Explicit token: the SDK would otherwise default to BLOB_READ_WRITE_TOKEN,
  // which belongs to the OLD public store and cannot read the private one.
  const token = privateStoreToken();
  if (!token) return null;

  try {
    const result = await get(fileUrl, {
      access: "private",
      token,
      ...(range ? { headers: { Range: range } } : {}),
    });
    if (!result?.stream) return null;
    const responseHeaders = new Headers(result.headers as HeadersInit | undefined);
    return {
      stream: result.stream as ReadableStream,
      headers: responseHeaders,
      // A satisfied Range request must answer 206, or the browser treats the
      // partial body as the whole file.
      status: range && responseHeaders.get("content-range") ? 206 : 200,
      contentType: responseHeaders.get("content-type") ?? undefined,
    };
  } catch {
    // Not a private blob (or unreadable as one) — the caller falls back.
    return null;
  }
}

function copyRangeHeaders(from: Headers, to: Headers): void {
  const contentRange = from.get("content-range");
  if (contentRange) to.set("Content-Range", contentRange);
  const contentLength = from.get("content-length");
  if (contentLength) to.set("Content-Length", contentLength);
}

// `filename` is a ByteString (Latin-1); a title with an em-dash throws when
// building the header rather than just looking wrong. Same treatment as the
// generated-document route: RFC 6266 `filename*` carries the real name.
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
