"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { DialogShell } from "@/components/DialogShell";
import { importFieldsFor, type ImportKind, type ImportMapping } from "@/lib/dataImport";
import { Button } from "@/components/ui";

type Analysis = {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  mapping: ImportMapping;
};

type Report = {
  totalRows: number;
  created?: number;
  updated?: number;
  skipped?: number;
  enrolled?: number;
  alreadyEnrolled?: number;
  errors: { line: number; message: string }[];
  missingCourseTitles?: string[];
  // Reprise d'historique : ce qui a été reconstitué (voir
  // /api/import/history). Compteurs distincts parce qu'une ligne y produit
  // plusieurs objets — un contact, une session partagée, un dossier, une
  // facture — là où les autres imports créent une fiche par ligne.
  contactsCrees?: number;
  sessionsCreees?: number;
  dossiersCrees?: number;
  dossiersDejaPresents?: number;
  facturesCreees?: number;
  facturesDejaPresentes?: number;
};

function csvFromTitles(titles: string[]): File {
  const csv = "titre\n" + titles.map((t) => `"${t.replace(/"/g, '""')}"`).join("\n");
  return new File([csv], "formations-manquantes.csv", { type: "text/csv" });
}

type SessionChoice = { id: string; startsAt: string; format: string; mode: string; spotsLeft: number };

// One dialog for both import kinds (CRM contacts, course catalog) — the
// field list, permissions and commit endpoint differ, the flow doesn't:
// upload -> validate the proposed column mapping -> import -> report.
export function ImportDataDialog({
  kind,
  courses,
  triggerClassName,
  initialFile,
  onClose,
}: {
  kind: ImportKind;
  courses?: { id: string; title: string }[];
  // Lets each host page match its neighboring action button (dark primary
  // next to "+ Nouveau prospect" on /crm, bordered next to "+ Créer une
  // formation" on /formations).
  triggerClassName?: string;
  // Opens straight into the mapping step with this file already analyzed,
  // skipping the picker — used by the contacts-import report to bridge
  // straight into "create these missing course titles" (see missingCourseTitles
  // below) without asking the user to build their own file.
  initialFile?: File;
  // Called instead of the default "just close" when initialFile is set: the
  // parent owns that file's lifetime (a piece of its own state), so it needs
  // to know when to stop rendering this instance rather than have it reset
  // back to an empty, file-picker-less dialog.
  onClose?: () => void;
}) {
  const router = useRouter();
  const fields = importFieldsFor(kind);
  const [open, setOpen] = useState(Boolean(initialFile));
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
  const [missingCoursesFile, setMissingCoursesFile] = useState<File | null>(null);

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

  function closeAndReset() {
    setOpen(false);
    reset();
    onClose?.();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialFile) analyze(initialFile);
  }, []);

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
    <>
    <DialogShell
      title={
        kind === "contacts"
          ? "Importer des contacts"
          : kind === "history"
            ? "Reprendre l'historique d'un ancien outil"
            : "Importer des formations"
      }
      onClose={closeAndReset}
      maxWidth="max-w-xl"
    >

        {report ? (
          <div className="flex flex-col gap-2.5">
            <div className="text-[12.5px] text-sage font-medium">Import terminé — {report.totalRows} ligne(s) lue(s).</div>
            {kind === "history" ? (
              <ul className="text-[12.5px] text-ink flex flex-col gap-1">
                <li>{report.contactsCrees ?? 0} apprenant(s) créé(s)</li>
                <li>{report.sessionsCreees ?? 0} session(s) passée(s) reconstituée(s)</li>
                <li>{report.dossiersCrees ?? 0} inscription(s) reprise(s)</li>
                {(report.dossiersDejaPresents ?? 0) > 0 && (
                  <li className="text-slate">{report.dossiersDejaPresents} déjà présente(s) — inchangée(s)</li>
                )}
                <li>{report.facturesCreees ?? 0} facture(s) payée(s) reprise(s)</li>
                {(report.facturesDejaPresentes ?? 0) > 0 && (
                  <li className="text-slate">{report.facturesDejaPresentes} référence(s) de facture déjà connue(s) — inchangée(s)</li>
                )}
              </ul>
            ) : (
              <ul className="text-[12.5px] text-ink flex flex-col gap-1">
                <li>{report.created ?? 0} créé(s)</li>
                <li>{report.updated ?? 0} mis à jour</li>
                <li>{report.skipped ?? 0} doublon(s) ignoré(s)</li>
                {report.enrolled !== undefined && <li>{report.enrolled} inscription(s) à une formation</li>}
                {report.alreadyEnrolled !== undefined && report.alreadyEnrolled > 0 && (
                  <li>{report.alreadyEnrolled} déjà inscrit(s) (inchangé)</li>
                )}
              </ul>
            )}
            {kind === "history" && (
              <div className="text-[12px] text-slate border border-line rounded-md p-2.5">
                Les sessions reprises sont rangées dans les archives du planning, pas dans la liste active. Le bilan
                pédagogique et financier des années concernées est à jour dès maintenant.
              </div>
            )}
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
            {report.missingCourseTitles && report.missingCourseTitles.length > 0 && (
              <div className="border border-line rounded-md p-3 flex flex-col gap-2">
                <div className="text-[12px] text-ink">
                  {report.missingCourseTitles.length} formation{report.missingCourseTitles.length > 1 ? "s" : ""} du fichier{" "}
                  {report.missingCourseTitles.length > 1 ? "n'existent" : "n'existe"} pas encore dans le catalogue — les
                  contacts concernés ont bien été importés, mais sans inscription :
                </div>
                <ul className="text-[12px] text-slate list-disc list-inside">
                  {report.missingCourseTitles.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setMissingCoursesFile(csvFromTitles(report.missingCourseTitles!))}
                  className="self-start text-[12px] font-medium text-seal hover:underline"
                >
                  Créer ces formations maintenant →
                </button>
              </div>
            )}
            <Button type="button" onClick={closeAndReset} className="self-start mt-1">
              Fermer
            </Button>
          </div>
        ) : !analysis ? (
          <div className="flex flex-col gap-3">
            <div className="text-[12.5px] text-slate leading-relaxed">
              {kind === "history" ? (
                <>
                  Déposez l&apos;export de votre ancien outil — <span className="font-medium text-ink">une ligne par
                  inscription passée</span>{" "}: qui, quelle formation, à quelles dates, combien d&apos;heures, facturé
                  combien et financé par qui. C&apos;est ce qui permet à votre bilan pédagogique et financier des années
                  antérieures d&apos;être exact.
                </>
              ) : (
                <>
                  Déposez un export de votre CRM ou de votre tableur (<span className="font-medium text-ink">.csv</span>{" "}
                  ou <span className="font-medium text-ink">.xlsx</span>). La première ligne doit contenir les noms de
                  colonnes — Jalon propose ensuite la correspondance, que vous validez avant tout import.
                </>
              )}
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
              {/* Pas de choix « ignorer / mettre à jour » pour une reprise
                  d'historique : elle est idempotente par construction (une
                  inscription déjà présente est laissée telle quelle, une
                  référence de facture déjà connue aussi), donc la question
                  n'a pas de réponse à proposer. */}
              <div className={`flex items-center gap-4 text-[12.5px] text-ink ${kind === "history" ? "hidden" : ""}`}>
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
              <Button
                type="button"
                onClick={runImport}
                disabled={importing || (sessionChoices !== null && !sessionId)}
              >
                {importing ? "Import en cours…" : `Importer ${analysis.totalRows} ligne(s)`}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => reset()} disabled={importing}>
                Changer de fichier
              </Button>
            </div>
          </div>
        )}
    </DialogShell>
    {missingCoursesFile && (
      <ImportDataDialog kind="courses" initialFile={missingCoursesFile} onClose={() => setMissingCoursesFile(null)} />
    )}
    </>
  );
}
