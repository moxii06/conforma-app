import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/tenant";
import { suggestMapping, importFieldsFor } from "@/lib/dataImport";
import { importPermissionError, readImportFile } from "@/lib/importFile";
import { suggestImportMappingWithAI } from "@/lib/ai";

// Step 1 of the data import (see ImportDataDialog): reads the uploaded
// CSV/XLSX, proposes a column mapping (deterministic synonyms first, AI
// only for the gaps), and returns a preview. Nothing is written — the
// commit happens in /api/import/contacts or /api/import/courses once the
// user has validated the mapping.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const kind = formData.get("kind");
  if (kind !== "contacts" && kind !== "courses" && kind !== "bank_transactions" && kind !== "history") {
    return NextResponse.json({ error: "Type d'import inconnu." }, { status: 400 });
  }
  // `session.roles` et non `session.role` : l'import ne borne rien à ce qui
  // appartient à la personne, c'est une pure question de droit — un
  // responsable administratif qui cumule la casquette commerciale doit
  // pouvoir analyser un fichier de contacts.
  const denied = importPermissionError(session.roles, kind);
  if (denied) return denied;

  const table = await readImportFile(formData);
  if (table instanceof NextResponse) return table;
  if (table.headers.length === 0 || table.rows.length === 0) {
    return NextResponse.json({ error: "Le fichier semble vide (aucune ligne de données sous les en-têtes)." }, { status: 400 });
  }

  const mapping = suggestMapping(table.headers, kind);

  const unresolved = importFieldsFor(kind).filter((f) => !mapping[f.key]);
  if (unresolved.length > 0) {
    const aiMapping = await suggestImportMappingWithAI({
      headers: table.headers,
      sampleRows: table.rows.slice(0, 2),
      fields: unresolved.map((f) => ({ key: f.key, label: f.label })),
    });
    if (aiMapping) {
      const alreadyUsed = new Set(Object.values(mapping).filter(Boolean));
      for (const [key, header] of Object.entries(aiMapping)) {
        if (!alreadyUsed.has(header)) {
          mapping[key] = header;
          alreadyUsed.add(header);
        }
      }
    }
  }

  return NextResponse.json({
    headers: table.headers,
    sampleRows: table.rows.slice(0, 3),
    totalRows: table.rows.length,
    mapping,
  });
}
