"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { GripVertical } from "lucide-react";
import { PipelineStage } from "@prisma/client";
import { Pill } from "@/components/ui";
import { OpportunityStageSelect } from "@/components/OpportunityStageSelect";
import { SendProspectDocumentDialog } from "@/components/SendProspectDocumentDialog";
import { ArchiveContactButton } from "@/components/ArchiveContactButton";
import { DeleteOpportunityButton } from "@/components/DeleteOpportunityButton";

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis envoyé",
  CONTRACT_SIGNED: "Convention signée",
  SESSION_SCHEDULED: "Session planifiée",
  TO_INVOICE: "À facturer",
  INVOICED: "Facturé",
  PAID: "Payé",
};

const URGENCY_LABELS: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Élevée" };
const URGENCY_TONES: Record<string, "neutral" | "warn" | "danger"> = { low: "neutral", medium: "warn", high: "danger" };

function formatAmount(cents: number | null) {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// A contact already on at least one Dossier has that as their canonical
// page (its own Formations tab already lists every formation they've
// taken) — see the same helper in crm/page.tsx, kept small enough that
// duplicating it here beats threading a resolved href through every row.
function contactHref(contact: { id: string; dossiers: { id: string }[] }): string {
  return contact.dossiers.length > 0 ? `/dossiers/${contact.dossiers[0].id}` : `/crm/contacts/${contact.id}`;
}

function ConsentCell({ emailConsent, smsConsent }: { emailConsent: boolean | null; smsConsent: boolean | null }) {
  if (emailConsent === null && smsConsent === null) return <span className="text-slate">—</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {emailConsent !== null && <Pill tone={emailConsent ? "good" : "danger"}>Email {emailConsent ? "oui" : "non"}</Pill>}
      {smsConsent !== null && <Pill tone={smsConsent ? "good" : "danger"}>SMS {smsConsent ? "oui" : "non"}</Pill>}
    </div>
  );
}

export type OpportunityRow = {
  id: string;
  contactId: string;
  label: string;
  amountCents: number | null;
  createdAt: Date;
  stage: PipelineStage;
  needsAssessmentRequests: { id: string }[];
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    industry: string | null;
    urgencyLevel: string | null;
    emailConsent: boolean | null;
    smsConsent: boolean | null;
    dossiers: { id: string }[];
  };
};

type ColumnId = "prospect" | "formation" | "montant" | "date" | "etape" | "secteur" | "urgence" | "consentement" | "actions";

const COLUMN_LABELS: Record<ColumnId, string> = {
  prospect: "Prospect",
  formation: "Formation",
  montant: "Montant",
  date: "Date",
  etape: "Étape",
  secteur: "Secteur",
  urgence: "Urgence",
  consentement: "Consentement",
  actions: "Actions",
};

const DEFAULT_ORDER: ColumnId[] = ["prospect", "formation", "montant", "date", "etape", "secteur", "urgence", "consentement", "actions"];
const STORAGE_KEY = "jalon-crm-column-order-v1";

function loadOrder(): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const saved: string[] = JSON.parse(raw);
    // A previously-persisted order missing a column (app updated since) or
    // carrying an id that no longer exists both fall back safely: append
    // whatever's new at the end, drop whatever's gone.
    const known = saved.filter((id): id is ColumnId => id in COLUMN_LABELS);
    const missing = DEFAULT_ORDER.filter((id) => !known.includes(id));
    return [...known, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

export function OpportunityTable({
  opportunities,
  canWrite,
  templates,
  signatureHtml,
  eSignatureAvailable,
}: {
  opportunities: OpportunityRow[];
  canWrite: boolean;
  templates: { id: string; title: string; category: string }[];
  signatureHtml: string;
  eSignatureAvailable: boolean;
}) {
  // Starts at the default order (matching what the server rendered) and
  // only switches to a saved order once mounted on the client — reading
  // localStorage in the initializer instead would run during SSR/hydration
  // too, where window.localStorage isn't the real one, and could disagree
  // with the server's markup and trip a hydration mismatch.
  const [order, setOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [dragId, setDragId] = useState<ColumnId | null>(null);

  useEffect(() => {
    setOrder(loadOrder());
  }, []);
  const columns = canWrite ? order : order.filter((id) => id !== "actions");

  function persist(next: ColumnId[]) {
    setOrder(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing / storage full — the reorder still works for this
      // page view, it just won't survive a reload. Not worth surfacing.
    }
  }

  function handleDrop(targetId: ColumnId) {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const fromIndex = next.indexOf(dragId);
    const toIndex = next.indexOf(targetId);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragId);
    persist(next);
    setDragId(null);
  }

  function cellFor(id: ColumnId, o: OpportunityRow): ReactNode {
    switch (id) {
      case "prospect":
        return (
          <>
            <Link
              href={contactHref(o.contact)}
              className="font-semibold text-ink hover:underline"
              title={o.contact.dossiers.length > 0 ? "Ouvre le dossier de formation" : "Ouvre la fiche prospect"}
            >
              {o.contact.firstName} {o.contact.lastName}
            </Link>
            {o.contact.dossiers.length > 0 && <span className="ml-1.5 text-[10px] text-slate align-middle">· dossier</span>}
          </>
        );
      case "formation":
        return o.label;
      case "montant":
        return formatAmount(o.amountCents);
      case "date":
        return format(o.createdAt, "d MMM yyyy", { locale: fr });
      case "etape":
        return canWrite ? <OpportunityStageSelect opportunityId={o.id} stage={o.stage} /> : <Pill tone="neutral">{STAGE_LABELS[o.stage]}</Pill>;
      case "secteur":
        return o.contact.industry || "—";
      case "urgence":
        return o.contact.urgencyLevel ? (
          <Pill tone={URGENCY_TONES[o.contact.urgencyLevel] ?? "neutral"}>{URGENCY_LABELS[o.contact.urgencyLevel] ?? o.contact.urgencyLevel}</Pill>
        ) : (
          "—"
        );
      case "consentement":
        return <ConsentCell emailConsent={o.contact.emailConsent} smsConsent={o.contact.smsConsent} />;
      case "actions":
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <SendProspectDocumentDialog
              opportunityId={o.id}
              alreadySentNeedsAssessment={o.needsAssessmentRequests.length > 0}
              templates={templates}
              contactFirstName={o.contact.firstName}
              signatureHtml={signatureHtml}
              eSignatureAvailable={eSignatureAvailable}
            />
            <ArchiveContactButton contactId={o.contactId} archived={false} />
            <DeleteOpportunityButton opportunityId={o.id} />
          </div>
        );
    }
  }

  const alignRight: Set<ColumnId> = new Set(["montant"]);
  const noWrap: Set<ColumnId> = new Set(["prospect", "montant", "date"]);

  return (
    <div className="bg-white border border-line rounded-card overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((id) => (
              <th
                key={id}
                draggable
                onDragStart={() => setDragId(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(id)}
                title="Glisser pour réordonner"
                className={`font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5 cursor-grab select-none ${
                  alignRight.has(id) ? "text-right" : "text-left"
                } ${dragId === id ? "opacity-50" : ""}`}
              >
                <span className="inline-flex items-center gap-1">
                  <GripVertical size={11} className="text-line" />
                  {COLUMN_LABELS[id]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id} className="border-b border-line last:border-b-0 hover:bg-mist">
              {columns.map((id) => (
                <td
                  key={id}
                  className={`px-4 py-3 ${alignRight.has(id) ? "text-right font-mono tabular-nums" : ""} ${
                    noWrap.has(id) ? "whitespace-nowrap" : ""
                  } ${id === "formation" ? "text-slate max-w-[220px] truncate" : ""}`}
                >
                  {cellFor(id, o)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {opportunities.length === 0 && <div className="text-[12.5px] text-slate px-4 py-4">Aucun prospect.</div>}
    </div>
  );
}
