"use client";

import { useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { MarkSignedButton } from "@/components/MarkSignedButton";
import { SendFinalDocumentDialog } from "@/components/SendFinalDocumentDialog";

// La liste de l'espace Documents.
//
// Un contrat engage une personne nommée : générer pour une session de 8
// apprenants produit 8 documents. Les afficher à plat donnait 8 lignes
// presque identiques, et la question quotidienne — « qui n'a pas encore
// signé ? » — obligeait à les ouvrir une par une. Un lot tient donc sur
// une ligne, qui se déplie.

export type GroupMember = {
  id: string;
  recipientName: string | null;
  signed: boolean;
  signedLabel: string | null;
  href: string;
  /** Vrai pour un PDF, qu'on ouvre à côté ; faux pour une page de Jalon. */
  external: boolean;
  canMarkSigned: boolean;
};

export type Group = {
  key: string;
  title: string;
  subtitle: string | null;
  dateLabel: string;
  categoryLabel: string | null;
  progressLabel: string | null;
  isBatch: boolean;
  /** Renseigné seulement dans l'onglet « finalisés » : le document est prêt à partir. */
  sendable: { scopeLabel: string; signatureAvailable: boolean; signatureHtml: string } | null;
  members: GroupMember[];
};

export function DocumentGroupList({ groups, emptyLabel }: { groups: Group[]; emptyLabel: string }) {
  if (groups.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card px-4 py-8 text-[12.5px] text-slate text-center">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="bg-white border border-line rounded-card">
      {groups.map((g) => (
        <GroupRow key={g.key} group={g} />
      ))}
    </div>
  );
}

function GroupRow({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);

  // Un document isolé reste un simple lien : le déplier ne montrerait
  // qu'une ligne, ce qui ferait un clic pour rien.
  if (!group.isBatch) {
    const m = group.members[0];
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 hover:bg-linen">
        <FileText size={15} className="text-ash shrink-0" />
        <a href={m.href} {...(m.external ? { target: "_blank", rel: "noreferrer" } : {})} className="flex-1 min-w-0">
          <div className="text-[13px] text-ink font-medium truncate">{group.title}</div>
          {group.subtitle && <div className="text-[11.5px] text-slate truncate">{group.subtitle}</div>}
        </a>
        {m.signedLabel && <span className="text-[11px] text-sage shrink-0">{m.signedLabel}</span>}
        {group.sendable && (
          <SendFinalDocumentDialog
            documentId={m.id}
            documentTitle={group.title}
            scopeLabel={group.sendable.scopeLabel}
            signatureAvailable={group.sendable.signatureAvailable}
            signatureHtml={group.sendable.signatureHtml}
          />
        )}
        {m.canMarkSigned && <MarkSignedButton documentId={m.id} />}
        <div className="text-[11px] text-slate shrink-0 w-[74px] text-right">{group.dateLabel}</div>
      </div>
    );
  }

  const restants = group.members.filter((m) => !m.signed).length;
  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-linen"
      >
        <ChevronRight size={15} className={`text-slate shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink font-medium truncate">{group.title}</div>
          <div className="text-[11.5px] text-slate truncate">
            {group.members.length} destinataires
            {group.subtitle ? ` · ${group.subtitle}` : ""}
          </div>
        </div>
        {group.progressLabel && (
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 ${
              restants === 0 ? "bg-[#DEE5E0] text-sage" : "bg-pebble text-slate"
            }`}
          >
            {group.progressLabel}
          </span>
        )}
        <div className="text-[11px] text-slate shrink-0 w-[74px] text-right">{group.dateLabel}</div>
      </button>

      {open && (
        <div className="bg-mist border-t border-line">
          {/* Les non-signés d'abord : c'est la raison d'avoir ouvert. */}
          {[...group.members].sort((a, b) => Number(a.signed) - Number(b.signed)).map((m) => (
            <div key={m.id} className="flex items-center gap-3 pl-11 pr-4 py-2 border-t border-line first:border-t-0">
              <a href={m.href} {...(m.external ? { target: "_blank", rel: "noreferrer" } : {})} className="flex-1 min-w-0 hover:underline decoration-line">
                <span className="text-[12.5px] text-ink">{m.recipientName ?? "Destinataire inconnu"}</span>
              </a>
              {m.signed ? (
                <span className="text-[11px] text-sage shrink-0">{m.signedLabel ?? "Signé"}</span>
              ) : (
                <span className="text-[11px] text-slate shrink-0">En attente</span>
              )}
              {m.canMarkSigned && <MarkSignedButton documentId={m.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
