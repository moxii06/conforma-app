"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";

export type PastRequest = {
  id: string;
  toolName: string;
  status: string;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Reçue",
  reviewing: "À l'étude",
  planned: "Planifiée",
  declined: "Non retenue",
  done: "Disponible",
};

const STATUS_TONES: Record<string, "neutral" | "warn" | "good" | "danger"> = {
  new: "neutral",
  reviewing: "warn",
  planned: "warn",
  declined: "danger",
  done: "good",
};

export function IntegrationRequestForm({ pastRequests }: { pastRequests: PastRequest[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toolName, setToolName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/integrations/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName, useCase }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "L'envoi a échoué. Réessayez.");
      return;
    }
    setSent(true);
    setToolName("");
    setUseCase("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="text-[13.5px] font-semibold text-ink mb-1">Un outil manque à cette liste ?</div>
      <div className="text-[12px] text-slate mb-3">
        Dites-nous lequel et ce que vous en attendez. Les demandes orientent réellement l&apos;ordre dans lequel
        nous branchons les connecteurs — c&apos;est le meilleur moyen de faire remonter le vôtre.
      </div>

      {sent && (
        <div className="text-[12px] text-sage mb-3">
          Demande enregistrée. Vous la retrouvez ci-dessous ; nous revenons vers vous par email.
        </div>
      )}

      {pastRequests.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3 pb-3 border-b border-line">
          <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">
            Vos demandes ({pastRequests.length})
          </div>
          {pastRequests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[12px] text-ink">
              <span className="flex-1 truncate">{r.toolName}</span>
              <span className="text-[11px] text-slate shrink-0">{r.createdAt}</span>
              <Pill tone={STATUS_TONES[r.status] ?? "neutral"}>{STATUS_LABELS[r.status] ?? r.status}</Pill>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div>
            <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">
              Nom de l&apos;outil
            </label>
            <input
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              required
              minLength={2}
              placeholder="ex. Pennylane, Zoom, Sage, Slack…"
              className="w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-seal placeholder:text-ash"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-semibold text-slate uppercase tracking-wide block mb-1">
              Ce que vous voulez en faire
            </label>
            <textarea
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              required
              minLength={10}
              rows={3}
              placeholder="ex. notre comptable travaille sur Pennylane, on ressaisit chaque facture à la main"
              className="w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-seal resize-none placeholder:text-ash"
            />
            <div className="text-[11px] text-slate mt-1">
              Décrivez le besoin plutôt que la solution : c&apos;est ce qui nous permet d&apos;arbitrer.
            </div>
          </div>
          {error && <div className="text-[11.5px] text-rust">{error}</div>}
          <div className="flex items-center gap-2.5">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Envoi…" : "Envoyer la demande"}
            </Button>
            <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setOpen(true);
            setSent(false);
          }}
        >
          Demander une intégration
        </Button>
      )}
    </div>
  );
}
