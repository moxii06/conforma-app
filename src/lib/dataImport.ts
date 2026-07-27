// Universal (client-safe) half of the data-import feature: CSV parsing,
// target-field definitions, heuristic header mapping, and value parsers.
// Deliberately no Node/Prisma imports — ImportDataDialog renders the field
// list and mapping UI from these same definitions, so they must bundle for
// the browser. The server-only half (XLSX reading, which needs node:zlib)
// lives in xlsxRead.ts.

export type ParsedTable = { headers: string[]; rows: string[][] };
export type ImportKind = "contacts" | "courses";

export type ImportFieldDef = {
  key: string;
  label: string;
  required?: boolean;
  // Normalized (lowercase, accent-stripped, alphanumeric-only) header names
  // this field should match. Exact matches win over substring matches — see
  // suggestMapping.
  synonyms: string[];
};

// The order matters twice: it's the display order in the mapping UI, and
// the claim order when two fields could match the same column (e.g. "nom"
// must be claimed by lastName before fullName's substring pass sees it).
export const CONTACT_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: "email",
    label: "Email",
    required: true,
    synonyms: ["email", "mail", "courriel", "adresseemail", "adressemail", "emailstagiaire", "mailstagiaire", "emailapprenant"],
  },
  {
    key: "lastName",
    label: "Nom",
    synonyms: ["nom", "lastname", "nomdefamille", "nomstagiaire", "nomapprenant", "nomcontact"],
  },
  {
    key: "firstName",
    label: "Prénom",
    synonyms: ["prenom", "firstname", "prenomstagiaire", "prenomapprenant", "prenomcontact"],
  },
  {
    key: "fullName",
    label: "Nom complet (sera découpé)",
    synonyms: ["nomcomplet", "fullname", "nomprenom", "prenomnom", "stagiaire", "apprenant", "contact", "nomcompletstagiaire"],
  },
  {
    key: "phone",
    label: "Téléphone",
    synonyms: ["telephone", "tel", "phone", "mobile", "portable", "telephonestagiaire", "numerodetelephone", "gsm"],
  },
  {
    key: "company",
    label: "Société / employeur",
    synonyms: ["societe", "entreprise", "company", "employeur", "organisation", "structure", "raisonsociale", "nomentreprise", "nomsociete"],
  },
  {
    key: "category",
    label: "Catégorie (BPF)",
    synonyms: ["categorie", "statut", "categorieapprenant", "statutstagiaire", "categoriebpf", "typedepublic", "public"],
  },
  {
    key: "courseTitle",
    label: "Formation (inscription)",
    synonyms: ["formation", "cours", "course", "intitule", "intituleformation", "nomformation", "programme", "libelleformation"],
  },
];

export const COURSE_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: "title",
    label: "Titre",
    required: true,
    synonyms: ["titre", "intitule", "formation", "nomformation", "title", "libelle", "intituleformation", "nom"],
  },
  {
    key: "description",
    label: "Description",
    synonyms: ["description", "descriptif", "resume", "presentation", "contenu"],
  },
  {
    key: "durationHours",
    label: "Durée (heures)",
    synonyms: ["duree", "dureeheures", "heures", "duration", "volumehoraire", "nbheures", "nombredheures", "dureeenheures"],
  },
  {
    key: "priceEuros",
    label: "Prix (€)",
    synonyms: ["prix", "tarif", "prixht", "montant", "cout", "price", "tarifht", "prixttc"],
  },
];

export function importFieldsFor(kind: ImportKind): ImportFieldDef[] {
  return kind === "contacts" ? CONTACT_IMPORT_FIELDS : COURSE_IMPORT_FIELDS;
}

export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// fieldKey -> header name from the file (not index: headers are what the
// user sees in the mapping UI selects, and duplicated header names are rare
// enough that first-occurrence wins is acceptable).
export type ImportMapping = Record<string, string | null>;

export function suggestMapping(headers: string[], kind: ImportKind): ImportMapping {
  const fields = importFieldsFor(kind);
  const normalized = headers.map(normalizeHeader);
  const mapping: ImportMapping = {};
  const claimed = new Set<number>();

  // Pass 1: exact matches only — so "nom" lands on lastName, not on the
  // first field whose synonym happens to contain it.
  for (const field of fields) {
    const idx = normalized.findIndex((h, i) => !claimed.has(i) && field.synonyms.includes(h));
    if (idx >= 0) {
      mapping[field.key] = headers[idx];
      claimed.add(idx);
    } else {
      mapping[field.key] = null;
    }
  }
  // Pass 2: substring matches for what's left ("email professionnel",
  // "téléphone portable du stagiaire"...).
  for (const field of fields) {
    if (mapping[field.key]) continue;
    const idx = normalized.findIndex(
      (h, i) => !claimed.has(i) && h.length > 0 && field.synonyms.some((s) => h.includes(s) || s.includes(h))
    );
    if (idx >= 0) {
      mapping[field.key] = headers[idx];
      claimed.add(idx);
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// CSV

// French Excel exports CSV with ";" and often Windows-1252 encoding; both
// are the rule here, not the edge case. Delimiter is detected on the first
// line (outside quotes) rather than assumed.
export function detectDelimiter(firstLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  let inQuotes = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  for (const c of candidates) {
    if (counts[c] > bestCount) {
      best = c;
      bestCount = counts[c];
    }
  }
  return best;
}

export function parseDelimited(text: string): ParsedTable {
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLineEnd = text.indexOf("\n");
  const delimiter = detectDelimiter(firstLineEnd === -1 ? text : text.slice(0, firstLineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...dataRows] = nonEmpty;
  return { headers: headerRow.map((h) => h.trim()), rows: dataRows };
}

// ---------------------------------------------------------------------------
// Value parsers

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/salari|employe|employee/, "employee"],
  [/demandeur|chomeur|chomage|jobseek|poleemploi|francetravail/, "jobseeker"],
  [/particulier|individu|individual|perso/, "individual"],
  [/apprenti|alternan|apprentice/, "apprentice"],
];

export function parseLearnerCategory(raw: string): string | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  for (const [pattern, value] of CATEGORY_PATTERNS) {
    if (pattern.test(n)) return value;
  }
  return null;
}

// "14", "14h", "14,5 heures" -> 15 (Course.durationHours is an Int).
export function parseHours(raw: string): number | null {
  const match = raw.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Math.round(parseFloat(match[0]));
  return value > 0 ? value : null;
}

// "1 200,50 €", "1200.50", "1200" -> 120050 (cents).
export function parsePriceCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s €]/g, "").replace(",", ".");
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Math.round(parseFloat(match[0]) * 100);
  return value >= 0 ? value : null;
}

// "Jean Dupont" -> Jean / Dupont ; "DUPONT Jean" (all-caps last name first,
// the common French administrative convention) -> Jean / DUPONT.
export function splitFullName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  const [first, ...rest] = parts;
  const isAllCaps = (s: string) => s.length > 1 && s === s.toUpperCase() && s !== s.toLowerCase();
  if (isAllCaps(first) && !isAllCaps(parts[1])) {
    return { firstName: rest.join(" "), lastName: first };
  }
  return { firstName: first, lastName: rest.join(" ") };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

// Reads a mapped cell for one row. Header duplication: first occurrence wins.
export function cellFor(table: ParsedTable, row: string[], mapping: ImportMapping, fieldKey: string): string {
  const header = mapping[fieldKey];
  if (!header) return "";
  const idx = table.headers.indexOf(header);
  if (idx === -1) return "";
  return (row[idx] ?? "").trim();
}
