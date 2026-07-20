import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { CATEGORY_LABELS, DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { ForkTemplateButton } from "@/components/ForkTemplateButton";
import { TemplateEditor } from "@/components/TemplateEditor";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import { GenerateDocumentButton } from "@/components/GenerateDocumentButton";
import { AVAILABLE_MERGE_FIELDS } from "@/lib/mergeTemplate";

export default async function DocumentsPage() {
  const { organizationId, role } = await requireSessionContext();
  if (can(role, "toolkit") === "none") redirect("/dashboard");

  const [globalTemplates, orgTemplates, dossiers] = await Promise.all([
    prisma.documentTemplate.findMany({ where: { organizationId: null }, orderBy: { title: "asc" } }),
    prisma.documentTemplate.findMany({ where: { organizationId }, orderBy: { title: "asc" } }),
    prisma.dossier.findMany({
      where: { organizationId },
      include: { contact: true, session: { include: { course: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const dossierOptions = dossiers.map((d) => ({
    id: d.id,
    label: `${d.contact.firstName} ${d.contact.lastName} — ${d.session.course.title}`,
  }));

  return (
    <>
      <PageHeader title="Bibliothèque de documents" subtitle="Modèles CGV, convention, convocation, évaluations…" />
      <div className="p-8 flex flex-col gap-6 max-w-3xl">
        <div className="text-[11.5px] text-slate">
          Les modèles fournis par Conforma sont des points de départ génériques — à faire relire par un juriste avant
          tout usage réel (voir le texte d&apos;avertissement inclus dans chaque modèle). Insérez des champs de
          fusion dans le texte d&apos;un modèle pour qu&apos;ils soient remplacés automatiquement à la génération :{" "}
          {AVAILABLE_MERGE_FIELDS.map((f) => (
            <code key={f} className="bg-[#F1EFE8] rounded px-1 py-0.5 mr-1 text-[10.5px]">{`{{${f}}}`}</code>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Modèles fournis par Conforma</div>
          {DOCUMENT_CATEGORIES.map((category) => {
            const items = globalTemplates.filter((t) => t.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="bg-white border border-line rounded-card p-4">
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">
                  {CATEGORY_LABELS[category]}
                </div>
                {items.map((t) => {
                  const alreadyForked = orgTemplates.some((o) => o.forkedFromId === t.id);
                  return (
                    <details key={t.id} className="border-t border-line first:border-t-0 py-2.5">
                      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                        <span className="text-[13px] text-ink font-medium">{t.title}</span>
                        {alreadyForked ? (
                          <span className="text-[12px] text-sage">Déjà adapté ✓</span>
                        ) : (
                          <ForkTemplateButton templateId={t.id} />
                        )}
                      </summary>
                      <pre className="whitespace-pre-wrap text-[12px] text-slate mt-2.5 font-sans leading-relaxed">
                        {t.bodyText}
                      </pre>
                      <div className="mt-2">
                        <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold text-ink">Vos modèles ({orgTemplates.length})</div>
          {orgTemplates.length > 0 && (
            <div className="bg-white border border-line rounded-card p-4">
              {DOCUMENT_CATEGORIES.map((category) => {
                const items = orgTemplates.filter((t) => t.category === category);
                if (items.length === 0) return null;
                return (
                  <div key={category} className="mb-3 last:mb-0">
                    <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">
                      {CATEGORY_LABELS[category]}
                    </div>
                    {items.map((t) => (
                      <details key={t.id} className="border-t border-line py-2.5">
                        <summary className="cursor-pointer list-none text-[13px] text-ink font-medium">
                          {t.title}
                          {t.forkedFromId && <span className="text-slate font-normal"> (adapté d&apos;un modèle Conforma)</span>}
                        </summary>
                        <div className="mt-2.5 flex flex-col gap-2.5">
                          <TemplateEditor templateId={t.id} title={t.title} bodyText={t.bodyText} />
                          <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                        </div>
                      </details>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          <NewTemplateForm />
        </div>
      </div>
    </>
  );
}
