import { describe, expect, it } from "vitest";
import { deflateRawSync, crc32 } from "zlib";
import {
  parseDelimited,
  detectDelimiter,
  suggestMapping,
  parseLearnerCategory,
  parseHours,
  parsePriceCents,
  splitFullName,
  isValidEmail,
} from "./dataImport";
import { parseXlsx } from "./xlsxRead";

// This is the data-integrity layer of the import feature: a parsing bug
// here silently corrupts a client's whole contact base on their very first
// action in the app. Same "pure logic, high blast radius" bar as tenant.ts
// and lms.ts (see vitest.config.ts).

describe("parseDelimited", () => {
  it("handles the standard French Excel CSV: semicolons, CRLF, quoted cells", () => {
    const csv = 'Nom;Prénom;Email\r\n"Dupont;fils";Jean;jean@ex.fr\r\nMartin;Léa;lea@ex.fr\r\n';
    const table = parseDelimited(csv);
    expect(table.headers).toEqual(["Nom", "Prénom", "Email"]);
    expect(table.rows).toEqual([
      ["Dupont;fils", "Jean", "jean@ex.fr"],
      ["Martin", "Léa", "lea@ex.fr"],
    ]);
  });

  it("detects comma and tab delimiters, and strips a UTF-8 BOM", () => {
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('a;"b,c";d')).toBe(";");
    const table = parseDelimited("﻿email,nom\na@b.fr,Durand");
    expect(table.headers).toEqual(["email", "nom"]);
  });

  it("unescapes doubled quotes and keeps newlines inside quoted cells", () => {
    const table = parseDelimited('titre;description\n"Excel ""avancé""";"ligne 1\nligne 2"');
    expect(table.rows[0]).toEqual(['Excel "avancé"', "ligne 1\nligne 2"]);
  });

  it("skips fully empty lines instead of producing ghost rows", () => {
    const table = parseDelimited("email;nom\n\na@b.fr;X\n;\n");
    expect(table.rows).toEqual([["a@b.fr", "X"]]);
  });
});

describe("suggestMapping", () => {
  it("maps a typical French CRM export, exact matches winning over substrings", () => {
    const mapping = suggestMapping(
      ["Nom", "Prénom", "E-mail", "Téléphone portable", "Entreprise", "Statut", "Formation"],
      "contacts"
    );
    expect(mapping.lastName).toBe("Nom");
    expect(mapping.firstName).toBe("Prénom");
    expect(mapping.email).toBe("E-mail");
    expect(mapping.phone).toBe("Téléphone portable");
    expect(mapping.company).toBe("Entreprise");
    expect(mapping.category).toBe("Statut");
    expect(mapping.courseTitle).toBe("Formation");
  });

  it("never assigns the same column to two fields", () => {
    // "Nom" alone must land on lastName and NOT also satisfy fullName.
    const mapping = suggestMapping(["Nom", "Email"], "contacts");
    expect(mapping.lastName).toBe("Nom");
    expect(mapping.fullName).toBeNull();
  });

  it("maps course-catalog headers including duration and price variants", () => {
    const mapping = suggestMapping(["Intitulé", "Descriptif", "Volume horaire", "Tarif HT"], "courses");
    expect(mapping.title).toBe("Intitulé");
    expect(mapping.description).toBe("Descriptif");
    expect(mapping.durationHours).toBe("Volume horaire");
    expect(mapping.priceEuros).toBe("Tarif HT");
  });
});

describe("value parsers", () => {
  it("recognizes the four BPF learner categories from free-text French", () => {
    expect(parseLearnerCategory("Salarié")).toBe("employee");
    expect(parseLearnerCategory("Demandeur d'emploi")).toBe("jobseeker");
    expect(parseLearnerCategory("France Travail")).toBe("jobseeker");
    expect(parseLearnerCategory("particulier")).toBe("individual");
    expect(parseLearnerCategory("Apprenti / alternance")).toBe("apprentice");
    expect(parseLearnerCategory("directeur")).toBeNull();
    expect(parseLearnerCategory("")).toBeNull();
  });

  it("parses hours and prices from French-formatted strings", () => {
    expect(parseHours("14h")).toBe(14);
    expect(parseHours("14,5 heures")).toBe(15);
    expect(parseHours("n/a")).toBeNull();
    expect(parsePriceCents("1 200,50 €")).toBe(120050);
    expect(parsePriceCents("1200")).toBe(120000);
    expect(parsePriceCents("gratuit")).toBeNull();
  });

  it("splits full names, honoring the French NOM-first all-caps convention", () => {
    expect(splitFullName("Jean Dupont")).toEqual({ firstName: "Jean", lastName: "Dupont" });
    expect(splitFullName("DUPONT Jean")).toEqual({ firstName: "Jean", lastName: "DUPONT" });
    expect(splitFullName("Marie de La Tour")).toEqual({ firstName: "Marie", lastName: "de La Tour" });
    expect(splitFullName("Cher")).toEqual({ firstName: "", lastName: "Cher" });
  });

  it("validates emails loosely but rejects the obviously broken", () => {
    expect(isValidEmail("a@b.fr")).toBe(true);
    expect(isValidEmail("prenom.nom+tag@sous.domaine.org")).toBe(true);
    expect(isValidEmail("pas-un-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// XLSX round-trip: build a real minimal .xlsx (a ZIP of OOXML parts, STORED
// entries so no compression is involved on the write side) and check the
// hand-rolled reader gets the cells back. This is the whole reason the
// reader can exist without a library — see xlsxRead.ts.

function zipStore(files: { name: string; data: string }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.data, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const cdStart = offset;
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

describe("parseXlsx", () => {
  it("reads shared strings, inline strings, numbers and rich text from a real minimal workbook", () => {
    const xlsx = zipStore([
      {
        name: "xl/workbook.xml",
        data: '<workbook xmlns:r="r"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      },
      {
        name: "xl/sharedStrings.xml",
        data: "<sst><si><t>Email</t></si><si><t>Nom &amp; titre</t></si><si><r><t>jean</t></r><r><t>@ex.fr</t></r></si></sst>",
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data:
          '<worksheet><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Durée</t></is></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>Dupont</t></is></c><c r="C2"><v>14</v></c></row>' +
          "</sheetData></worksheet>",
      },
    ]);
    const table = parseXlsx(new Uint8Array(xlsx));
    expect(table.headers).toEqual(["Email", "Nom & titre", "Durée"]);
    expect(table.rows).toEqual([["jean@ex.fr", "Dupont", "14"]]);
  });

  it("rejects a non-xlsx buffer with a clear French error", () => {
    expect(() => parseXlsx(new Uint8Array(Buffer.from("pas un zip du tout")))).toThrow(/classeur Excel/);
  });
});
