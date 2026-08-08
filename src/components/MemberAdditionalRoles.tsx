"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// `import type` : ce composant ne manipule que des valeurs de rôle reçues
// en props, jamais l'objet enum lui-même — inutile d'emporter le runtime
// Prisma dans le paquet navigateur.
import type { Role } from "@prisma/client";
import {
  ACCESS_LABELS,
  ASSIGNABLE_ADDITIONAL_ROLES,
  FEATURE_LABELS,
  PERMISSIONS,
  ROLE_LABELS,
  accessSource,
  effectiveRoles,
  type AccessLevel,
} from "@/lib/tenant";
import { Button, Pill } from "@/components/ui";
import { DialogShell } from "@/components/DialogShell";
import { useToast } from "@/components/ToastProvider";

const TONE_BY_LEVEL: Record<AccessLevel, "good" | "warn" | "neutral"> = {
  full: "good",
  limited: "warn",
  none: "neutral",
};

const FEATURES = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

/**
 * Ajouter des casquettes à un membre — « formateur, et aussi commercial ».
 *
 * Des cases à cocher et non une seconde liste déroulante : on en ajoute
 * plusieurs, et c'est bien l'outil que Controls.tsx désigne pour choisir
 * dans une liste. Mais surtout, l'écran ne se contente pas de faire cocher
 * un intitulé : il montre CE QUE ÇA OUVRE, ligne par ligne et à mesure. Le
 * nom d'un rôle ne dit rien de ses droits à qui n'a pas la matrice en tête,
 * et distribuer des accès à l'aveugle sur un CRM et une facturation est
 * exactement ce qu'un organisme ne peut pas se permettre.
 */
export function MemberAdditionalRoles({
  memberId,
  memberName,
  role,
  additionalRoles,
}: {
  memberId: string;
  memberName: string;
  /** Le rôle principal — jamais proposé à la coche, il est déjà acquis. */
  role: Role;
  additionalRoles: Role[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Role[]>(additionalRoles);
  const [saving, setSaving] = useState(false);

  const choices = ASSIGNABLE_ADDITIONAL_ROLES.filter((r) => r !== role);

  function toggle(r: Role) {
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function openDialog() {
    // On repart toujours de ce qui est enregistré : une modification
    // abandonnée ne doit pas réapparaître à la réouverture.
    setSelected(additionalRoles);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/team/members/${memberId}/additional-roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ additionalRoles: selected }),
    }).catch(() => null);
    setSaving(false);

    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      toast.error(body.error ?? "Enregistrement impossible.");
      return;
    }
    setOpen(false);
    toast.success(
      selected.length === 0
        ? `${memberName} n'a plus de rôle cumulé.`
        : `Rôles cumulés enregistrés pour ${memberName}.`,
    );
    router.refresh();
  }

  // Ce que donnerait le rôle principal seul, pour n'afficher en aperçu que
  // ce que le cumul CHANGE. Une matrice de 19 lignes identiques à 3 lignes
  // près ne se lit pas ; les 3 lignes, si.
  const base = effectiveRoles(role);
  const cumul = effectiveRoles(role, selected);
  const gains = FEATURES.map((feature) => ({
    feature,
    avant: accessSource(base, feature).level,
    apres: accessSource(cumul, feature),
  })).filter((r) => r.avant !== r.apres.level);

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {additionalRoles.length > 0 ? (
          additionalRoles.map((r) => <Pill key={r}>{ROLE_LABELS[r]}</Pill>)
        ) : (
          <span className="text-[11.5px] text-ash">Aucun</span>
        )}
        <Button variant="tertiary" size="sm" onClick={openDialog}>
          {additionalRoles.length > 0 ? "Modifier" : "Ajouter"}
        </Button>
      </div>

      {open && (
        <DialogShell
          title="Rôles cumulés"
          subtitle={`${memberName} — rôle principal : ${ROLE_LABELS[role]}`}
          onClose={() => setOpen(false)}
        >
          <div className="text-[12px] text-slate leading-relaxed">
            Un formateur qui est aussi commercial garde son rôle principal et reçoit, en plus, les droits des rôles
            cochés ici. Pour chaque fonctionnalité, c&apos;est le <strong className="text-ink">meilleur</strong>{" "}
            niveau de ses rôles qui s&apos;applique — cocher un rôle n&apos;enlève jamais un accès.
          </div>

          <div className="flex flex-col">
            {choices.map((r) => (
              <label
                key={r}
                className="flex items-center gap-2.5 py-2 border-b border-line last:border-b-0 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(r)}
                  onChange={() => toggle(r)}
                  disabled={saving}
                  className="h-3.5 w-3.5 accent-sage"
                />
                <span className="text-[13px] text-ink">{ROLE_LABELS[r]}</span>
              </label>
            ))}
          </div>

          <div className="bg-linen border border-line rounded-card p-3.5">
            <div className="text-[12.5px] font-semibold text-ink mb-2">Ce que ce cumul ouvre en plus</div>
            {selected.length === 0 ? (
              <div className="text-[12px] text-slate">
                Aucun rôle coché — ce membre garde les droits de {ROLE_LABELS[role]}, et rien d&apos;autre.
              </div>
            ) : gains.length === 0 ? (
              <div className="text-[12px] text-slate">
                Rien de nouveau : le rôle {ROLE_LABELS[role]} ouvre déjà au moins autant sur chaque fonctionnalité.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {gains.map((g) => (
                  <div key={g.feature} className="flex items-center gap-2 text-[12px] flex-wrap">
                    <span className="text-ink">{FEATURE_LABELS[g.feature] ?? g.feature}</span>
                    <span className="text-ash">:</span>
                    <Pill tone={TONE_BY_LEVEL[g.apres.level]}>{ACCESS_LABELS[g.apres.level]}</Pill>
                    {g.apres.sourceRole && (
                      <span className="text-slate">(issu de {ROLE_LABELS[g.apres.sourceRole]})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* La matrice complète reste à un clic : l'aperçu ci-dessus dit ce
              qui change, celle-ci dit où on en est. Repliée par défaut, car
              ce n'est pas la question qu'on se pose en cochant. */}
          <details className="text-[12px]">
            <summary className="cursor-pointer text-slate hover:text-ink">
              Voir le détail des {FEATURES.length} fonctionnalités
            </summary>
            <div className="mt-2 flex flex-col">
              {FEATURES.map((feature) => {
                const { level, sourceRole } = accessSource(cumul, feature);
                return (
                  <div
                    key={feature}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-b-0"
                  >
                    <span className="text-ink min-w-0">{FEATURE_LABELS[feature] ?? feature}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {sourceRole && sourceRole !== role && (
                        <span className="text-[11px] text-slate">issu de {ROLE_LABELS[sourceRole]}</span>
                      )}
                      <Pill tone={TONE_BY_LEVEL[level]}>{ACCESS_LABELS[level]}</Pill>
                    </span>
                  </div>
                );
              })}
            </div>
          </details>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </DialogShell>
      )}
    </>
  );
}
