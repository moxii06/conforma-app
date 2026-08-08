"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, MapPin, Video, Users, Ban, Trash2, PenLine, RotateCcw } from "lucide-react";
import { Button, Pill } from "@/components/ui";
import { DialogShell, Field } from "@/components/DialogShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SegmentedControl, FORMAT_OPTIONS } from "@/components/Controls";
import { useToast } from "@/components/ToastProvider";

/**
 * Les ateliers ponctuels d'une session.
 *
 * À quoi ça sert : une session « en continu » n'a pas de cohorte — chacun
 * avance à son rythme — mais l'organisme veut malgré tout réunir tout le
 * monde une fois, pour un live, une correction collective, une soutenance.
 * L'atelier est ce rendez-vous daté DANS la session, sans créer une
 * deuxième session ni un deuxième dossier (voir SessionAtelier dans
 * schema.prisma).
 *
 * Ce que l'écran doit refuser de laisser croire : qu'un atelier vaut
 * émargement. D'où la phrase en tête du panneau, qui n'est pas décorative —
 * un organisme qui prendrait cette liste pour sa preuve d'audit arriverait
 * en audit Qualiopi sans feuille de présence.
 */

export type FormatAtelier = "IN_PERSON" | "REMOTE" | "HYBRID";

export type AtelierParticipantRow = {
  dossierId: string;
  /** Présence effective, distincte de l'inscription. ISO ou null. */
  presentAt: string | null;
};

export type AtelierRow = {
  id: string;
  titre: string;
  description: string | null;
  /**
   * ISO. Sert UNIQUEMENT à pré-remplir le formulaire de modification, qui
   * n'existe qu'après un clic — donc côté navigateur, dans son fuseau.
   * L'affichage, lui, passe par `creneauLabel` : formater une date dans un
   * composant client la rend dans le fuseau du serveur au premier rendu puis
   * dans celui du visiteur à l'hydratation, et les deux ne concordent pas.
   */
  startsAt: string;
  endsAt: string;
  /** Le créneau déjà mis en français par le serveur, prêt à afficher. */
  creneauLabel: string;
  format: string;
  location: string | null;
  meetingLink: string | null;
  capacity: number | null;
  annuleeAt: string | null;
  /**
   * Calculé sur le serveur plutôt qu'avec un `new Date()` au rendu : la
   * même comparaison faite au rendu serveur puis à l'hydratation peut
   * tomber des deux côtés d'un atelier qui vient de se terminer, et React
   * signale alors une différence de rendu.
   */
  passe: boolean;
  participants: AtelierParticipantRow[];
};

/** Un dossier de la session : c'est lui qu'on inscrit, pas le contact. */
export type AtelierDossierRow = { id: string; nom: string };

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: "Présentiel",
  REMOTE: "Distanciel",
  HYBRID: "Mixte",
};

const FORM_VIDE = {
  titre: "",
  description: "",
  debut: "",
  fin: "",
  format: "REMOTE" as FormatAtelier,
  location: "",
  meetingLink: "",
  capacity: "",
};

type FormAtelier = typeof FORM_VIDE;

/** ISO → valeur d'un <input type="datetime-local"> (heure locale). */
function pourChampDateHeure(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

/** Créneau par défaut à l'ouverture du formulaire : demain, 9h–12h. */
function creneauParDefaut(): { debut: string; fin: string } {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const jour = format(demain, "yyyy-MM-dd");
  return { debut: `${jour}T09:00`, fin: `${jour}T12:00` };
}

const CHAMP = "border border-line rounded-md px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-seal disabled:bg-linen disabled:text-slate w-full";

export function SessionAteliersPanel({
  sessionId,
  ateliers,
  dossiers,
  canEdit,
}: {
  sessionId: string;
  ateliers: AtelierRow[];
  /** Les apprenants inscrits à la session — le vivier des inscriptions. */
  dossiers: AtelierDossierRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [dialogue, setDialogue] = useState<{ mode: "creation" } | { mode: "edition"; atelier: AtelierRow } | null>(null);
  const [form, setForm] = useState<FormAtelier>(FORM_VIDE);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  // Quel atelier a sa liste d'inscrits dépliée, et quelle commande est en
  // cours (pour neutraliser le contrôle le temps de l'aller-retour). La clé
  // est `atelierId` pour une action sur l'atelier, `atelierId:dossierId` pour
  // une action sur une personne — les deux formes ne peuvent pas se
  // confondre.
  const [listeOuverte, setListeOuverte] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  // Seuls les deux gestes qui font perdre quelque chose passent par une
  // confirmation. Rétablir un atelier annulé ne détruit rien : le demander
  // deux fois, et en rouge par-dessus le marché, ferait passer une réparation
  // pour un danger.
  const [confirmation, setConfirmation] = useState<
    { type: "annuler" | "supprimer"; atelier: AtelierRow } | null
  >(null);
  const [erreurConfirm, setErreurConfirm] = useState<string | null>(null);

  function majForm(patch: Partial<FormAtelier>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function ouvrirCreation() {
    const creneau = creneauParDefaut();
    setForm({ ...FORM_VIDE, ...creneau });
    setErreurForm(null);
    setDialogue({ mode: "creation" });
  }

  function ouvrirEdition(atelier: AtelierRow) {
    setForm({
      titre: atelier.titre,
      description: atelier.description ?? "",
      debut: pourChampDateHeure(atelier.startsAt),
      fin: pourChampDateHeure(atelier.endsAt),
      format: (atelier.format === "IN_PERSON" || atelier.format === "HYBRID" ? atelier.format : "REMOTE") as FormatAtelier,
      location: atelier.location ?? "",
      meetingLink: atelier.meetingLink ?? "",
      capacity: atelier.capacity != null ? String(atelier.capacity) : "",
    });
    setErreurForm(null);
    setDialogue({ mode: "edition", atelier });
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!dialogue) return;
    setErreurForm(null);

    if (form.titre.trim() === "") {
      setErreurForm("Donnez un titre à l'atelier.");
      return;
    }
    const debut = new Date(form.debut);
    const fin = new Date(form.fin);
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      setErreurForm("Renseignez la date et l'heure de début et de fin.");
      return;
    }
    if (fin <= debut) {
      setErreurForm("L'heure de fin doit suivre l'heure de début.");
      return;
    }
    const capacity = form.capacity.trim() === "" ? null : Number(form.capacity);
    if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) {
      setErreurForm("La capacité doit être un nombre entier de places, ou rester vide.");
      return;
    }
    // Un atelier dont on réduit la capacité sous le nombre d'inscrits n'est
    // pas rejeté : personne n'est désinscrit d'office, l'atelier est
    // simplement affiché en surnombre et n'accepte plus d'inscription.

    setEnregistrement(true);
    const enEdition = dialogue.mode === "edition";
    const url =
      dialogue.mode === "edition"
        ? `/api/planning/sessions/${sessionId}/ateliers/${dialogue.atelier.id}`
        : `/api/planning/sessions/${sessionId}/ateliers`;
    const res = await fetch(
      url,
      {
        method: enEdition ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: form.titre.trim(),
          description: form.description,
          startsAt: debut.toISOString(),
          endsAt: fin.toISOString(),
          format: form.format,
          location: form.location,
          meetingLink: form.meetingLink,
          capacity,
        }),
      },
    ).catch(() => null);
    setEnregistrement(false);

    if (!res || !res.ok) {
      const corps = res ? await res.json().catch(() => ({})) : {};
      setErreurForm(corps.error ?? "Enregistrement impossible.");
      return;
    }
    toast.success(enEdition ? "Atelier modifié." : "Atelier créé.");
    setDialogue(null);
    router.refresh();
  }

  async function basculerInscription(atelier: AtelierRow, dossierId: string, inscrire: boolean) {
    setEnCours(`${atelier.id}:${dossierId}`);
    const base = `/api/planning/sessions/${sessionId}/ateliers/${atelier.id}/participants`;
    const res = await fetch(inscrire ? base : `${base}?dossierId=${encodeURIComponent(dossierId)}`, {
      method: inscrire ? "POST" : "DELETE",
      ...(inscrire
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dossierId }) }
        : {}),
    }).catch(() => null);
    setEnCours(null);

    if (!res || !res.ok) {
      const corps = res ? await res.json().catch(() => ({})) : {};
      toast.error(corps.error ?? "Action impossible.");
      return;
    }
    router.refresh();
  }

  async function basculerPresence(atelier: AtelierRow, dossierId: string, present: boolean) {
    setEnCours(`${atelier.id}:${dossierId}`);
    const res = await fetch(`/api/planning/sessions/${sessionId}/ateliers/${atelier.id}/participants`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId, present }),
    }).catch(() => null);
    setEnCours(null);

    if (!res || !res.ok) {
      const corps = res ? await res.json().catch(() => ({})) : {};
      toast.error(corps.error ?? "Action impossible.");
      return;
    }
    router.refresh();
  }

  async function confirmerAction() {
    if (!confirmation) return;
    const { type, atelier } = confirmation;
    setEnregistrement(true);
    setErreurConfirm(null);

    const res = await fetch(`/api/planning/sessions/${sessionId}/ateliers/${atelier.id}`, {
      method: type === "supprimer" ? "DELETE" : "PATCH",
      ...(type === "supprimer"
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ annulee: true }) }),
    }).catch(() => null);
    setEnregistrement(false);

    if (!res || !res.ok) {
      const corps = res ? await res.json().catch(() => ({})) : {};
      setErreurConfirm(corps.error ?? "Action impossible.");
      return;
    }
    toast.success(type === "supprimer" ? "Atelier supprimé." : "Atelier annulé.");
    setConfirmation(null);
    router.refresh();
  }

  async function retablir(atelier: AtelierRow) {
    setEnCours(atelier.id);
    const res = await fetch(`/api/planning/sessions/${sessionId}/ateliers/${atelier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annulee: false }),
    }).catch(() => null);
    setEnCours(null);

    if (!res || !res.ok) {
      const corps = res ? await res.json().catch(() => ({})) : {};
      toast.error(corps.error ?? "Action impossible.");
      return;
    }
    toast.success("Atelier rétabli.");
    router.refresh();
  }

  const enPresentiel = form.format === "IN_PERSON" || form.format === "HYBRID";
  const aDistance = form.format === "REMOTE" || form.format === "HYBRID";

  return (
    <div className="flex flex-col gap-3.5">
      {/* La phrase qui empêche le contresens le plus coûteux de cet écran. */}
      <div className="text-[11.5px] text-slate border-l-2 border-seal pl-2.5 py-0.5 leading-relaxed">
        Un atelier n&apos;est <span className="font-semibold text-ink">pas un émargement légal</span> : votre preuve
        Qualiopi reste la feuille de présence signée par demi-journée. Ce qui est pointé ici sert à votre suivi, pas à
        votre audit.
      </div>

      {ateliers.length === 0 ? (
        <div className="text-[12.5px] text-slate">
          Aucun atelier. Utile surtout en formation continue : un rendez-vous unique pour réunir des apprenants qui
          avancent chacun à leur rythme.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ateliers.map((atelier) => {
            const annule = Boolean(atelier.annuleeAt);
            const inscrits = atelier.participants.length;
            const presents = atelier.participants.filter((p) => p.presentAt).length;
            const complet = atelier.capacity != null && inscrits >= atelier.capacity;
            const inscritsParDossier = new Map(atelier.participants.map((p) => [p.dossierId, p]));
            const ouverte = listeOuverte === atelier.id;

            return (
              <div key={atelier.id} className="border border-line rounded-md px-3.5 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div
                      className={`text-[13px] font-medium ${annule ? "text-slate line-through" : "text-ink"}`}
                    >
                      {atelier.titre}
                    </div>
                    <div className="text-[11.5px] text-slate mt-0.5">{atelier.creneauLabel}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <Pill tone={annule ? "danger" : atelier.passe ? "neutral" : "good"}>
                      {annule ? "Annulé" : atelier.passe ? "Passé" : "À venir"}
                    </Pill>
                    <Pill tone={complet && !annule ? "warn" : "neutral"}>
                      {atelier.capacity != null ? `${inscrits}/${atelier.capacity} inscrits` : `${inscrits} inscrit${inscrits > 1 ? "s" : ""}`}
                    </Pill>
                  </div>
                </div>

                {atelier.description && (
                  <div className="text-[12px] text-slate leading-relaxed">{atelier.description}</div>
                )}

                <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-slate">
                  <span>{FORMAT_LABELS[atelier.format] ?? atelier.format}</span>
                  {atelier.location && (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{atelier.location}</span>
                    </span>
                  )}
                  {atelier.meetingLink && (
                    <a
                      href={atelier.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline decoration-line hover:text-ink"
                    >
                      <Video size={12} /> Lien de connexion
                    </a>
                  )}
                  {presents > 0 && <span>{presents} présent{presents > 1 ? "s" : ""} pointé{presents > 1 ? "s" : ""}</span>}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() => setListeOuverte(ouverte ? null : atelier.id)}
                    >
                      <Users size={12} /> {ouverte ? "Masquer les inscrits" : "Inscrits et présences"}
                    </Button>
                    {!annule && (
                      <Button variant="tertiary" size="sm" onClick={() => ouvrirEdition(atelier)}>
                        <PenLine size={12} /> Modifier
                      </Button>
                    )}
                    {annule ? (
                      <Button
                        variant="tertiary"
                        size="sm"
                        disabled={enCours === atelier.id}
                        onClick={() => retablir(atelier)}
                      >
                        <RotateCcw size={12} /> Rétablir
                      </Button>
                    ) : (
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          setErreurConfirm(null);
                          setConfirmation({ type: "annuler", atelier });
                        }}
                      >
                        <Ban size={12} /> Annuler l&apos;atelier
                      </Button>
                    )}
                    {/* Supprimer n'existe que tant que personne ne s'est
                        inscrit : au-delà, l'annulation est la seule sortie,
                        pour que les inscrits voient que le rendez-vous
                        n'aura pas lieu. */}
                    {inscrits === 0 && (
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          setErreurConfirm(null);
                          setConfirmation({ type: "supprimer", atelier });
                        }}
                      >
                        <Trash2 size={12} /> Supprimer
                      </Button>
                    )}
                  </div>
                )}

                {canEdit && ouverte && (
                  <div className="border-t border-line pt-2.5 mt-0.5 flex flex-col gap-1.5">
                    {dossiers.length === 0 ? (
                      <div className="text-[12px] text-slate">Aucun apprenant inscrit à la session pour l&apos;instant.</div>
                    ) : (
                      <>
                        {complet && !annule && (
                          <div className="text-[11.5px] text-rust">
                            Atelier complet ({atelier.capacity}{" "}places) — désinscrivez quelqu&apos;un ou augmentez la
                            capacité pour ajouter une personne.
                          </div>
                        )}
                        {annule && (
                          <div className="text-[11.5px] text-slate">
                            Atelier annulé : les inscriptions sont figées, la liste reste consultable.
                          </div>
                        )}
                        {dossiers.map((d) => {
                          const participant = inscritsParDossier.get(d.id);
                          const inscrit = Boolean(participant);
                          const occupe = enCours === `${atelier.id}:${d.id}`;
                          // Une case décochée devient inatteignable quand
                          // l'atelier est plein ou annulé ; une case cochée
                          // reste toujours décochable.
                          const bloque = occupe || annule || (!inscrit && complet);
                          return (
                            <div key={d.id} className="flex items-center justify-between gap-3 py-0.5">
                              <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={inscrit}
                                  disabled={bloque}
                                  onChange={(e) => basculerInscription(atelier, d.id, e.target.checked)}
                                  className="accent-seal shrink-0 disabled:opacity-50"
                                />
                                <span className="text-[12.5px] text-ink truncate">{d.nom}</span>
                              </label>
                              {inscrit && (
                                <button
                                  type="button"
                                  disabled={occupe}
                                  onClick={() => basculerPresence(atelier, d.id, !participant?.presentAt)}
                                  className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 disabled:opacity-50 ${
                                    participant?.presentAt ? "bg-[#DEE5E0] text-sage" : "bg-pebble text-slate"
                                  }`}
                                >
                                  {participant?.presentAt ? "Présent" : "Marquer présent"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div>
          <Button size="sm" onClick={ouvrirCreation}>
            <Plus size={13} /> Nouvel atelier
          </Button>
        </div>
      )}

      {dialogue && (
        <DialogShell
          title={dialogue.mode === "edition" ? "Modifier l'atelier" : "Nouvel atelier"}
          subtitle="Un rendez-vous ponctuel dans cette session — il ne crée ni session ni dossier supplémentaire."
          onClose={() => setDialogue(null)}
        >
          <form onSubmit={soumettre} className="flex flex-col gap-3.5">
            <Field label="Titre">
              <input
                value={form.titre}
                onChange={(e) => majForm({ titre: e.target.value })}
                placeholder="Atelier de correction collective"
                className={CHAMP}
              />
            </Field>

            <Field label="Description" hint="facultatif">
              <textarea
                value={form.description}
                onChange={(e) => majForm({ description: e.target.value })}
                rows={2}
                placeholder="Ce qui sera fait pendant l'atelier."
                className={CHAMP}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Début">
                <input
                  type="datetime-local"
                  value={form.debut}
                  onChange={(e) => majForm({ debut: e.target.value })}
                  className={CHAMP}
                />
              </Field>
              <Field label="Fin">
                <input
                  type="datetime-local"
                  value={form.fin}
                  onChange={(e) => majForm({ fin: e.target.value })}
                  className={CHAMP}
                />
              </Field>
            </div>

            {/* Pas de <Field> ici : celui-ci enveloppe son contenu dans un
                <label>, et un groupe de boutons radio n'a pas à vivre
                dedans. SegmentedControl porte son propre libellé accessible. */}
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] text-slate uppercase tracking-wide">Format</span>
              <SegmentedControl<FormatAtelier>
                label="Format de l'atelier"
                value={form.format}
                disabled={enregistrement}
                onChange={(v) => majForm({ format: v })}
                options={FORMAT_OPTIONS}
              />
            </div>

            {/* Lieu OU lien de visio selon le format : demander les deux à
                chaque fois, c'est laisser une salle renseignée sur un
                atelier qui se tient finalement en visio. */}
            {enPresentiel && (
              <Field label="Lieu">
                <input
                  value={form.location}
                  onChange={(e) => majForm({ location: e.target.value })}
                  placeholder="Salle B, 12 rue des Écoles, Lyon"
                  className={CHAMP}
                />
              </Field>
            )}
            {aDistance && (
              <Field label="Lien de visio">
                <input
                  value={form.meetingLink}
                  onChange={(e) => majForm({ meetingLink: e.target.value })}
                  placeholder="https://meet.jit.si/mon-atelier"
                  className={CHAMP}
                />
              </Field>
            )}

            <Field label="Capacité" hint="facultatif — vide = pas de plafond">
              <input
                type="number"
                min="1"
                step="1"
                value={form.capacity}
                onChange={(e) => majForm({ capacity: e.target.value })}
                placeholder="12"
                className={CHAMP}
              />
            </Field>

            {erreurForm && <div className="text-[11.5px] text-rust">{erreurForm}</div>}

            <div className="flex items-center justify-end gap-2.5">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDialogue(null)} disabled={enregistrement}>
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={enregistrement}>
                {enregistrement ? "…" : dialogue.mode === "edition" ? "Enregistrer" : "Créer l'atelier"}
              </Button>
            </div>
          </form>
        </DialogShell>
      )}

      {confirmation && (
        <ConfirmDialog
          open
          title={
            confirmation.type === "supprimer"
              ? `Supprimer « ${confirmation.atelier.titre} » ?`
              : `Annuler « ${confirmation.atelier.titre} » ?`
          }
          description={
            confirmation.type === "supprimer"
              ? "Personne n'y est inscrit : l'atelier disparaît définitivement."
              : "L'atelier reste visible, barré, pour les personnes déjà inscrites — il n'est pas supprimé. Vous pourrez le rétablir."
          }
          confirmLabel={confirmation.type === "supprimer" ? "Supprimer définitivement" : "Annuler l'atelier"}
          loading={enregistrement}
          error={erreurConfirm}
          onConfirm={confirmerAction}
          onCancel={() => {
            setConfirmation(null);
            setErreurConfirm(null);
          }}
        />
      )}
    </div>
  );
}
