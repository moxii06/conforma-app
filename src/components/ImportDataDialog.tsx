"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { importFieldsFor, type ImportKind, type ImportMapping } from "@/lib/dataImport";

type Analysis = {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  mapping: ImportMapping;
};

type Report = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  enrolled?: number;
  alreadyEnrolled?: number;
  errors: { line: number; message: string }[];
};

type SessionChoice = { id: string; startsAt: string; format: string; mode: string; spotsLeft: number };

// One dialog for both import kinds (CRM contacts, course catalog) — the
// field list, permissions and commit endpoint differ, the flow doesn't:
// upload -> validate the proposed column mapping -> import -> report.
export function ImportDataDialog({
  kind,
  courses,
  triggerClassName,
}: {
  kind: ImportKind;
  courses?: { id: string; title: string }[];
  // Lets each host page match its neighboring action button (dark primary
  // next to "+ Nouveau prospect" on /crm, bordered next to "+ Créer une
  // formation" on /formations).
  triggerClassName?: string;
}) {
  const router = useRouter();
  const fields = importFieldsFor(kind);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [duplicates, setDuplicates] = useState<"skip" | "update">("skip");
  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionChoices, setSessionChoices] = useState<SessionChoice[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setDuplicates("skip");
    setCourseId("");
    setSessionId("");
    setSessionChoices(null);
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
    body.append("kind", kind);
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
    body.append(
      "options",
      JSON.stringify(
        kind === "contacts"
          ? { duplicates, ...(courseId ? { courseId } : {}), ...(sessionId ? { sessionId } : {}) }
          : { duplicates }
      )
    );
    const res = await fetch(`/api/import/${kind}`, { method: "POST", body });
    const data = await res.json().catch(() => null);
    setImporting(false);
    if (!res.ok || !data) {
      if (data?.needsSessionSelection && Array.isArray(data.sessions)) {
        setSessionChoices(data.sessions);
        setError("Cette formation a plusieurs sessions — choisissez celle où inscrire les contacts.");
        return;
      }
      setError(data?.error ?? "Échec de l'import.");
      return;
    }
    setReport(data);
    router.refresh();
  }

  const sampleFor = (header: string | null) => {
    if (!header || !analysis) return "";
    const idx = analysis.headers.indexOf(header);
    return idx === -1 ? "" : (analysis.sampleRows[0]?.[idx] ?? "");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink border border-line rounded-md px-3 py-1.5 hover:border-ink-soft"
        }
      >
        <Upload size={13} />
        Importer
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-line w-full max-w-xl max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-semibold text-ink">
            {kind === "contacts" ? "Importer des contacts" : "Importer des formations"}
          </div>
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
            <div className="text-[12.5px] text-sage font-medium">Import terminé — {report.totalRows} ligne(s) lue(s).</div>
            <ul className="text-[12.5px] text-ink flex flex-col gap-1">
              <li>{report.created} créé(s)</li>
              <li>{report.updated} mis à jour</li>
              <li>{report.skipped} doublon(s) ignoré(s)</li>
              {report.enrolled !== undefined && <li>{report.enrolled} inscription(s) à une formation</li>}
              {report.alreadyEnrolled !== undefined && report.alreadyEnrolled > 0 && (
                <li>{report.alreadyEnrolled} déjà inscrit(s) (inchangé)</li>
              )}
            </ul>
            {report.errors.length > 0 && (
              <div className="border border-line rounded-md p-3 max-h-44 overflow-y-auto">
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
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="self-start bg-ink text-white text-[12.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft mt-1"
            >
              Fermer
            </button>
          </div>
        ) : !analysis ? (
          <div className="flex flex-col gap-3">
            <div className="text-[12.5px] text-slate leading-relaxed">
              Déposez un export de votre CRM ou de votre tableur (<span className="font-medium text-ink">.csv</span> ou{" "}
              <span className="font-medium text-ink">.xlsx</span>). La première ligne doit contenir les noms de colonnes —
              Jalon propose ensuite la correspondance, que vous validez avant tout import.
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
                  <div className="w-32 shrink-0 text-[11.5px] text-slate truncate" title={sampleFor(mapping[f.key] ?? null)}>
                    {sampleFor(mapping[f.key] ?? null)}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line pt-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-4 text-[12.5px] text-ink">
                <span className="text-slate">Si {kind === "contacts" ? "l'email" : "le titre"} existe déjà :</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={duplicates === "skip"} onChange={() => setDuplicates("skip")} />
                  Ignorer la ligne
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={duplicates === "update"} onChange={() => setDuplicates("update")} />
                  Mettre à jour la fiche
                </label>
              </div>

              {kind === "contacts" && courses && courses.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <div className="text-[12.5px] text-slate shrink-0">Inscrire tous les contacts à :</div>
                  <select
                    value={courseId}
                    onChange={(e) => {
                      setCourseId(e.target.value);
                      setSessionId("");
                      setSessionChoices(null);
                    }}
                    className="flex-1 border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
                  >
                    <option value="">— Aucune formation —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {kind === "contacts" && mapping.courseTitle && (
                <div className="text-[11.5px] text-slate">
                  La colonne « {mapping.courseTitle} » du fichier prime, ligne par ligne, sur ce choix global.
                </div>
              )}

              {sessionChoices && (
                <div className="flex items-center gap-2.5">
                  <div className="text-[12.5px] text-slate shrink-0">Session :</div>
                  <select
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="flex-1 border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal bg-white"
                  >
                    <option value="">— Choisir une session —</option>
                    {sessionChoices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.startsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} ·{" "}
                        {s.mode === "ROLLING" ? "en continu" : s.format} · {s.spotsLeft} place(s)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {error && <div className="text-[12.5px] text-rust">{error}</div>}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={runImport}
                disabled={importing || (sessionChoices !== null && !sessionId)}
                className="bg-ink text-white text-[12.5px] font-medium rounded-md px-4 py-2 hover:bg-ink-soft disabled:opacity-50"
              >
                {importing ? "Import en cours…" : `Importer ${analysis.totalRows} ligne(s)`}
              </button>
              <button
                type="button"
                onClick={() => reset()}
                disabled={importing}
                className="text-[12.5px] text-slate hover:text-ink"
              >
                Changer de fichier
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
