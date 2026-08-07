"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SessionFormat, SessionMode } from "@prisma/client";
import { Button } from "@/components/ui";
import { SegmentedControl, FORMAT_OPTIONS, RYTHME_OPTIONS } from "@/components/Controls";

type Course = { id: string; title: string };
type Trainer = { id: string; name: string };

// location is one physical field doing double duty depending on format —
// see the Prisma comment on Session.location. Client feedback: the field
// used to always read "si présentiel", which made no sense once Distanciel
// was picked. A REMOTE session doesn't need this at all in practice (a
// Jitsi link auto-generates at first invitation send if left blank), but
// staff can still paste a real Zoom/Teams link here to use instead.
const LOCATION_PLACEHOLDER: Record<SessionFormat, string> = {
  IN_PERSON: "Lieu / adresse",
  REMOTE: "Lien de visio (facultatif — généré automatiquement sinon)",
  HYBRID: "Lieu et/ou lien de visio",
};

export function CreateSessionForm({
  courses,
  trainers,
  lockedCourse,
  onCreated,
}: {
  courses: Course[];
  trainers: Trainer[];
  // Appelé depuis la fiche d'une formation : la formation est déjà connue,
  // donc pas de sélecteur — juste son nom en rappel. Sans ce mode, créer
  // une session depuis la fiche obligeait à retrouver la même formation
  // dans une liste déroulante qu'on venait de quitter.
  lockedCourse?: { id: string; title: string };
  // Le planning fait confiance à router.refresh() pour révéler la nouvelle
  // session. Ici, la fiche formation ne montre pas la liste du planning :
  // on prévient l'appelant pour qu'il l'affiche lui-même (ou y renvoie).
  onCreated?: (session: { id: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseMode, setCourseMode] = useState<"existing" | "new">(courses.length > 0 || !!lockedCourse ? "existing" : "new");
  const [courseId, setCourseId] = useState(lockedCourse?.id ?? courses[0]?.id ?? "");
  const [courseTitle, setCourseTitle] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [mode, setMode] = useState<SessionMode>(SessionMode.FIXED_DATE);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [format, setFormat] = useState<SessionFormat>(SessionFormat.IN_PERSON);
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "FIXED_DATE" && !date) {
      setError("Choisissez une date.");
      return;
    }
    setLoading(true);
    setError(null);

    const startsAt = mode === "FIXED_DATE" ? new Date(`${date}T${startTime}`).toISOString() : undefined;
    const endsAt = mode === "FIXED_DATE" ? new Date(`${date}T${endTime}`).toISOString() : undefined;

    const res = await fetch("/api/planning/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseMode,
        courseId: courseMode === "existing" ? (lockedCourse?.id ?? courseId) : undefined,
        courseTitle: courseMode === "new" ? courseTitle : undefined,
        trainerId: trainerId || undefined,
        mode,
        startsAt,
        endsAt,
        format,
        location: location || undefined,
        // En bande passante il n'y a pas de places a remplir, mais la valeur
        // EST lue (resolveEnrollmentSession, assertCourseHasRoom, les
        // ecrans catalogue/planning qui comparent inscrits vs capacite) :
        // envoyer 1 complétait la session des le deuxieme inscrit. On
        // reprend le meme defaut genereux que l'autre chemin de creation
        // silencieuse (DEFAULT_SESSION_CAPACITY dans lib/enrollment.ts),
        // qui vaut pour une capacite volontairement illimitee ici.
        capacity: mode === "FIXED_DATE" ? parseInt(capacity, 10) || 1 : 500,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Erreur lors de la création.");
      return;
    }

    setCourseTitle("");
    setLocation("");
    setDate("");
    setOpen(false);
    const created = await res.json().catch(() => null);
    if (onCreated && created?.id) onCreated(created);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" className="self-start">
        + Nouvelle session
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-card p-4 flex flex-col gap-3 max-w-xl">
      {lockedCourse ? (
        <div className="text-[12.5px] text-ink">
          Formation : <span className="font-medium">{lockedCourse.title}</span>
        </div>
      ) : (
        <>
          {/* Sans aucune formation au catalogue il n'y a rien à choisir :
              le sélecteur proposerait une option qui ouvre une liste vide.
              courseMode vaut déjà « new » dans ce cas. */}
          {courses.length > 0 && (
            <SegmentedControl
              value={courseMode}
              onChange={(v) => setCourseMode(v)}
              label="Formation"
              options={[
                { value: "existing" as const, label: "Formation existante" },
                { value: "new" as const, label: "Nouvelle formation" },
              ]}
            />
          )}

          {courseMode === "existing" ? (
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal">
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          ) : (
            <input required placeholder="Intitulé du cours" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
          )}
        </>
      )}

      {/* Le rythme, avec les MÊMES libellés qu'à l'étape 1 de la création
          d'une formation. Il y avait ici « Date fixe » / « En continu (bande
          passante) » et là-bas « Session à date fixe » / « En continu —
          chacun son calendrier » : un même choix, deux vocabulaires, à deux
          clics d'écart. Les options viennent maintenant de la seule
          définition qui existe. */}
      <SegmentedControl
        value={mode}
        onChange={(v) => setMode(v as SessionMode)}
        options={RYTHME_OPTIONS}
        label="Rythme"
      />

      <div className="flex gap-2">
        <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1">
          <option value="">Formateur à assigner</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Sélecteur segmenté, comme à l'étape 1 de la création d'une
          formation. Le format tenait dans un menu déroulant à côté du
          formateur : le même choix avait deux apparences selon l'écran par
          lequel on arrivait. */}
      <SegmentedControl
        value={format}
        onChange={(v) => setFormat(v as SessionFormat)}
        options={FORMAT_OPTIONS}
        label="Format"
      />

      {mode === "FIXED_DATE" ? (
        <div className="flex gap-2">
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal" />
          <input required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
          <input required type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-28" />
        </div>
      ) : (
        <div className="text-[11.5px] text-slate">Toujours disponible — chaque apprenant a son propre délai, réglé à son inscription.</div>
      )}

      <div className="flex gap-2">
        <input placeholder={LOCATION_PLACEHOLDER[format]} value={location} onChange={(e) => setLocation(e.target.value)} className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal flex-1" />
        {/* Le nombre de places n'existe qu'en date fixe. En bande passante
            il n'y a pas de promotion à remplir : chacun s'inscrit quand il
            veut, avec son propre délai. Le champ s'affichait quand même, et
            son libellé « Places » disparaissait dès qu'on saisissait un
            chiffre — on voyait donc un nombre nu, sans savoir ce qu'il
            comptait ni pourquoi il fallait le renseigner. */}
        {mode === "FIXED_DATE" && (
          <label className="flex items-center gap-1.5 text-[12px] text-slate shrink-0">
            <span>Places</span>
            <input
              required
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal w-20"
            />
          </label>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <Button type="submit" disabled={loading} size="sm">
          {loading ? "…" : "Créer"}
        </Button>
        <Button variant="tertiary" size="sm" type="button" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {error && <div className="text-[12px] text-rust">{error}</div>}
    </form>
  );
}
