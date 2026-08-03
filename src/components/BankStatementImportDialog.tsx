"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { importFieldsFor, type ImportMapping } from "@/lib/dataImport";
import { Button } from "@/components/ui";

type Analysis = { headers: string[]; sampleRows: string[][]; totalRows: number; mapping: ImportMapping };
type Report = { totalRows: number; creditRowsFound: number; imported: number; alreadyKnown: number; errors: { line: number; message: string }[] };

// Deliberately its own (simpler) dialog rather than reusing
// ImportDataDialog: a relevé bancaire has no "update existing" concept
// (a bank line isn't an editable record) and no target-course picker —
// just upload, confirm the 3-column mapping, import. Still built on the
// same /api/import/analyze mapping-suggestion endpoint (kind=
// "bank_transactions") as contacts/courses import.
export function BankStatementImportDialog() {
  const router = useRouter();
  const fields = importFieldsFor("bank_transactions");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setImporting(false);
    setReport(null);
    setError(null);
  }

  async function analyze(selected: File) {
    setFile(selected);
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    const body = new FormData();
    body.append("file", selected);
    body.append("kind", "bank_transactions");
    const res = await fetch("/api/import/analyze", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setAnalyzing(false);
    if (!res.ok || !data) {
      setError(data?.error ?? "Échec de l'analyse du fichier.");
      setFile(null);
      return;
    }
    setAnalysis(data);
    setMapping(data.mapping);
  }

  async function runImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("mapping", JSON.stringify(mapping));
    const res = await fetch("/api/import/bank-transactions", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setImporting(false);
    if (!res.ok || !data) {
      setError(data?.error ?? "Échec de l'import.");
      return;
    }
    setReport(data);
    router.refresh();
  }

  const missingRequired = fields.some((f) => f.required && !mapping[f.key]);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Upload size={13} />
        Importer un relevé
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">Importer un relevé bancaire</div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-slate hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {report ? (
          <div className="flex flex-col gap-2.5">
            <div className="text-[12.5px] text-sage font-medium">
              {report.imported} nouvelle{report.imported > 1 ? "s" : ""} transaction{report.imported > 1 ? "s" : ""} à valider.
            </div>
            <ul className="text-[12.5px] text-ink flex flex-col gap-1">
              <li>{report.creditRowsFound} entrée(s) trouvée(s) dans le fichier</li>
              <li>{report.alreadyKnown} déjà connue(s) (fichier déjà importé)</li>
            </ul>
            {report.errors.length > 0 && (
              <div className="border border-line rounded-md p-3 max-h-40 overflow-y-auto">
                <div className="text-[12px] font-medium text-rust mb-1.5">{report.errors.length} ligne(s) signalée(s) :</div>
                <ul className="text-[12px] text-slate flex flex-col gap-1">
                  {report.errors.map((e, i) => (
                    <li key={i}>
                      Ligne {e.line} — {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              type="button"
              className="self-start mt-1"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Fermer
            </Button>
          </div>
        ) : !analysis ? (
          <div className="flex flex-col gap-3">
            <div className="text-[12.5px] text-slate leading-relaxed">
              Export CSV ou Excel de votre compte en ligne (relevé de mouvements). Seules les entrées créditrices
              (encaissements) sont retenues — les prélèvements et débits sont ignorés.
            </div>
            <label className="border border-dashed border-line rounded-md px-4 py-8 text-center text-[12.5px] text-slate cursor-pointer hover:border-ink-soft hover:text-ink">
              {analyzing ? "Analyse du fichier…" : file ? file.name : "Choisir un fichier .csv ou .xlsx"}
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={analyzing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) analyze(f);
                }}
              />
            </label>
            {error && <div className="text-[12.5px] text-rust">{error}</div>}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="text-[12.5px] text-slate">
              <span className="font-medium text-ink">{file?.name}</span> — {analysis.totalRows} ligne(s). Vérifiez la
              correspondance des colonnes :
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2.5">
                  <div className="w-44 shrink-0 text-[12.5px] text-ink">
                    {f.label}
                    {f.required && <span className="text-rust"> *</span>}
                  </div>
                  <select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                    className="flex-1 border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
                  >
                    <option value="">— Non importé —</option>
                    {analysis.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {error && <div className="text-[12.5px] text-rust">{error}</div>}
            <div className="flex items-center gap-2.5">
              <Button type="button" onClick={runImport} disabled={importing || missingRequired}>
                {importing ? "Import en cours…" : "Importer"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => reset()} disabled={importing}>
                Changer de fichier
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
