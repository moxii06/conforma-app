import { inflateRawSync } from "zlib";
import type { ParsedTable } from "@/lib/dataImport";

// Minimal, read-only .xlsx parser — deliberately hand-rolled instead of
// pulling in exceljs/SheetJS: both dragged vulnerable transitive
// dependencies into npm audit (right after this project cleaned it), and
// all we need is "read the cells of the first sheet of a normal Excel
// export". An .xlsx is a ZIP of XML files; node:zlib inflates the entries
// natively, and the OOXML subset real-world exports use (sharedStrings,
// inline strings, numbers, formula cached values) is small enough to parse
// directly. Files this can't read get a clear error telling the user to
// export CSV instead — the universal fallback every spreadsheet tool has.
// Server-only (node:zlib) — the client-safe import logic lives in
// dataImport.ts.

export class XlsxError extends Error {}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

type ZipEntry = { name: string; compressedSize: number; method: number; localHeaderOffset: number };

function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  // EOCD is at the very end, possibly preceded by a comment (max 64 KiB).
  const minEocd = 22;
  let eocd = -1;
  const scanStart = Math.max(0, buf.length - minEocd - 65536);
  for (let i = buf.length - minEocd; i >= scanStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new XlsxError("Ce fichier n'est pas un classeur Excel valide (.xlsx).");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIG) throw new XlsxError("Archive Excel corrompue.");
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.set(name, { name, compressedSize, method, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntryData(buf: Buffer, entry: ZipEntry): Buffer {
  // Sizes from the central directory are authoritative — the local header
  // may carry zeroes when the writer used a data descriptor.
  const lho = entry.localHeaderOffset;
  const nameLength = buf.readUInt16LE(lho + 26);
  const extraLength = buf.readUInt16LE(lho + 28);
  const dataStart = lho + 30 + nameLength + extraLength;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new XlsxError("Méthode de compression Excel non prise en charge.");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Concatenates every <t>…</t> inside one <si> (plain or rich-text runs).
//
// Every tag matched below tolerates an optional namespace prefix
// (`<x:row>`, `<ns:c>`...) — legal, spec-compliant OOXML that most writers
// skip (they bind the spreadsheetml namespace as the *default*, unprefixed
// one) but that some export tools use anyway. A file that does gets
// silently read as entirely empty otherwise: none of `<row>`, `<c>`, `<v>`
// match `<x:row>` etc., and an empty grid looks identical to a genuinely
// empty sheet from here on.
const TAG = "(?:\\w+:)?";
function textOfSharedItem(si: string): string {
  let out = "";
  const re = new RegExp(`<${TAG}t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${TAG}t>|<${TAG}t(?:\\s[^>]*)?\\/>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(si))) out += m[1] ? decodeEntities(m[1]) : "";
  return out;
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const items: string[] = [];
  const re = new RegExp(`<${TAG}si(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${TAG}si>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) items.push(textOfSharedItem(m[1]));
  return items;
}

function columnIndex(cellRef: string): number {
  let idx = 0;
  for (const ch of cellRef) {
    if (ch >= "A" && ch <= "Z") idx = idx * 26 + (ch.charCodeAt(0) - 64);
    else break;
  }
  return idx - 1;
}

// The "first" sheet is resolved through workbook.xml + its rels (tab order),
// falling back to xl/worksheets/sheet1.xml for writers with odd rels.
function firstSheetPath(entries: Map<string, ZipEntry>, buf: Buffer): string {
  const workbookEntry = entries.get("xl/workbook.xml");
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  if (workbookEntry && relsEntry) {
    const workbook = readEntryData(buf, workbookEntry).toString("utf8");
    const rels = readEntryData(buf, relsEntry).toString("utf8");
    const firstSheet = workbook.match(new RegExp(`<${TAG}sheet\\s[^>]*r:id="([^"]+)"`));
    if (firstSheet) {
      const rel = rels.match(new RegExp(`<${TAG}Relationship\\s[^>]*Id="${firstSheet[1]}"[^>]*Target="([^"]+)"`));
      if (rel) {
        const target = rel[1].replace(/^\//, "");
        return target.startsWith("xl/") ? target : `xl/${target}`;
      }
    }
  }
  return "xl/worksheets/sheet1.xml";
}

export function parseXlsx(input: Uint8Array): ParsedTable {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const entries = readZipEntries(buf);

  const sheetPath = firstSheetPath(entries, buf);
  const sheetEntry = entries.get(sheetPath);
  if (!sheetEntry) throw new XlsxError("Aucune feuille de calcul trouvée dans ce classeur.");
  const sheetXml = readEntryData(buf, sheetEntry).toString("utf8");

  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const shared = parseSharedStrings(sharedEntry ? readEntryData(buf, sharedEntry).toString("utf8") : null);

  const grid: string[][] = [];
  let maxCol = 0;
  const rowRe = new RegExp(`<${TAG}row(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${TAG}row>`, "g");
  const cellRe = new RegExp(`<${TAG}c\\s([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${TAG}c>)`, "g");
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(sheetXml))) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+)\d+"/);
      const type = attrs.match(/t="([a-z]+)"/i)?.[1] ?? "n";
      const col = ref ? columnIndex(ref[1]) : cells.length;

      let value = "";
      if (type === "inlineStr") {
        value = textOfSharedItem(inner);
      } else {
        const v = inner.match(new RegExp(`<${TAG}v(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${TAG}v>`));
        const raw = v ? decodeEntities(v[1]) : "";
        if (type === "s") {
          const idx = parseInt(raw, 10);
          value = Number.isInteger(idx) && shared[idx] !== undefined ? shared[idx] : "";
        } else if (type === "b") {
          value = raw === "1" ? "vrai" : "faux";
        } else {
          // n, str, e — the raw cached value. Date cells arrive as Excel
          // serial numbers; none of the import target fields are dates, so
          // no serial→date conversion is attempted here.
          value = raw;
        }
      }
      cells[col] = value;
      if (col + 1 > maxCol) maxCol = col + 1;
    }
    grid.push(cells);
  }

  const dense = grid
    .map((r) => Array.from({ length: maxCol }, (_, i) => (r[i] ?? "").trim()))
    .filter((r) => r.some((c) => c !== ""));
  if (dense.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...rows] = dense;
  return { headers: headerRow, rows };
}
