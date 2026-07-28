"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";

type Props = {
  dossierId: string;
  moduleId: string;
  type: string;
  fileUrl: string | null;
  percentComplete: number;
  lastPositionSeconds: number | null;
  allowSkip: boolean;
  skippedAt: string | null;
};

// A jump of more than this many seconds between two timeupdate ticks can't
// happen from normal playback (which fires roughly every 250ms) — it means
// the learner dragged the scrubber. Only treated as suspicious when it also
// lands them near the very end (see SUSPICIOUS_JUMP_MIN_PERCENT) — jumping
// to the middle of a video is just normal seeking around, not an attempt
// to skip watching it.
const SUSPICIOUS_JUMP_SECONDS = 3;
const SUSPICIOUS_JUMP_MIN_PERCENT = 95;

// Replaces the old manual "type a number 0-100" input with real tracking:
// a video's progress comes from actual playback position (furthest point
// reached, via the <video> element's own timeupdate/pause/ended events),
// not a self-reported guess. A document has no equivalent browser signal
// for "was this actually read," so it stays an explicit action — "Marquer
// comme terminé" — rather than pretending opening a link proves anything
// (see the honesty note in the original spec: don't count a document as
// assimilated just because it was opened).
//
// Dragging the scrubber straight to the end is the obvious way to fake
// "watched" — this is caught (see SUSPICIOUS_JUMP_*) and prompts a
// confirmation ("avez-vous bien visionné...") instead of silently
// recording completion. It only ever asks once: a module already at 100%
// when the component first mounts (percentComplete prop) is trusted from
// then on, so rewatching/scrubbing around a finished video never
// re-prompts. This is a nudge, not real proctoring — a learner who lies at
// the prompt still gets through, same as the old input did; the point is
// to stop the *accidental* "oops I dragged to the end" case, not defeat a
// determined cheater.
export function LmsModulePlayer({ dossierId, moduleId, type, fileUrl, percentComplete, lastPositionSeconds, allowSkip, skippedAt }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [percent, setPercent] = useState(percentComplete);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const lastSavedRef = useRef(percentComplete);
  const lastSaveAtRef = useRef(0);
  const lastTimeRef = useRef(0);
  // A module that's "complete" only because it was skipped doesn't get the
  // same trust a genuinely-watched one does — re-arms the anti-scrub
  // confirmation below so scrubbing to the end after a skip still asks
  // "did you really watch it," same gate a first-time viewing gets.
  const alreadyCompletedOnceRef = useRef(percentComplete >= 100 && !skippedAt);
  const confirmOpenRef = useRef(false);
  const pendingPercentRef = useRef(0);
  const resumedRef = useRef(false);

  async function handleSkip() {
    setConfirmSkipOpen(false);
    setSkipping(true);
    await fetch(`/api/lms/modules/${moduleId}/skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId }),
    });
    setSkipping(false);
    router.refresh();
  }

  async function save(next: number, position: number, force = false) {
    const now = Date.now();
    if (!force && (next <= lastSavedRef.current || now - lastSaveAtRef.current < 4000)) return;
    lastSavedRef.current = Math.max(lastSavedRef.current, next);
    lastSaveAtRef.current = now;
    setSaving(true);
    await fetch("/api/lms/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId, moduleId, percentComplete: next, lastPositionSeconds: Math.round(position) }),
    });
    setSaving(false);
    router.refresh();
  }

  // Picks up from wherever the learner last paused rather than always
  // starting at 0 — only once per mount (resumedRef), and only if the
  // saved position still makes sense against this file's actual duration
  // (a replaced video, see ReplaceModuleFileForm, could be shorter).
  function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget;
    if (resumedRef.current || !lastPositionSeconds) return;
    resumedRef.current = true;
    if (lastPositionSeconds < video.duration) {
      video.currentTime = lastPositionSeconds;
      lastTimeRef.current = lastPositionSeconds;
    }
  }

  function handleTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    if (confirmOpenRef.current) return;
    const video = e.currentTarget;
    if (!video.duration || Number.isNaN(video.duration)) return;

    const delta = video.currentTime - lastTimeRef.current;
    const pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
    lastTimeRef.current = video.currentTime;

    const isSuspiciousJump =
      !alreadyCompletedOnceRef.current && delta > SUSPICIOUS_JUMP_SECONDS && pct >= SUSPICIOUS_JUMP_MIN_PERCENT;

    if (isSuspiciousJump) {
      video.pause();
      pendingPercentRef.current = pct;
      confirmOpenRef.current = true;
      setConfirmOpen(true);
      return;
    }

    if (pct > percent) setPercent(pct);
    save(pct, video.currentTime);
  }

  function handlePauseOrEnd(e: React.SyntheticEvent<HTMLVideoElement>) {
    if (confirmOpenRef.current) return;
    const video = e.currentTarget;
    if (!video.duration || Number.isNaN(video.duration)) return;
    const pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
    // Once skipped, `percent` is pinned at 100 (see save's guard below) —
    // Math.max(pct, percent) would report a fake 100 on every pause, never
    // letting a genuine partial re-watch register. Send the honest,
    // freshly-measured pct instead so the server can tell a real
    // crossing-into-100 apart from the skip's own artificial one.
    save(skippedAt ? pct : Math.max(pct, percent), video.currentTime, true);
  }

  function handleConfirmYes() {
    alreadyCompletedOnceRef.current = true;
    confirmOpenRef.current = false;
    setConfirmOpen(false);
    const pct = pendingPercentRef.current;
    setPercent(pct);
    save(pct, videoRef.current?.currentTime ?? 0, true);
  }

  function handleConfirmNo() {
    confirmOpenRef.current = false;
    setConfirmOpen(false);
    // Send them back a bit before the jump so there's actually something
    // left to watch, rather than leaving the scrubber sitting at the end.
    const video = videoRef.current;
    if (video) {
      const rewindTo = Math.max(0, (percent / 100) * video.duration);
      video.currentTime = rewindTo;
      lastTimeRef.current = rewindTo;
    }
  }

  // A "page" module has no file by design — its content is the rich-text
  // description, already rendered above/below this by CourseModulesList.
  // This branch only owns the completion action, same manual
  // "Marquer comme terminé" pattern as the document fallback below (a page
  // has no browser signal for "was this actually read" either).
  if (type === "page") {
    return (
      <div className="flex items-center gap-3">
        {percent >= 100 ? (
          <span className="text-[11px] text-sage">Lu</span>
        ) : (
          <button
            onClick={() => { setPercent(100); save(100, 0, true); }}
            disabled={saving}
            className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
          >
            {saving ? "…" : "Marquer comme lu"}
          </button>
        )}
      </div>
    );
  }

  if (!fileUrl) {
    return <div className="text-[11.5px] text-slate">Contenu pas encore déposé par l&apos;organisme.</div>;
  }

  if (type === "video") {
    return (
      <div className="flex flex-col gap-1.5">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- learner-uploaded content, no source captions available in this scaffold */}
        <video
          ref={videoRef}
          // Streamed through our own session-gated proxy (see the route's
          // comment for why) rather than the raw storage URL — nothing
          // downloadable-and-shareable ever reaches the page source.
          src={`/api/lms/modules/${moduleId}/stream`}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePauseOrEnd}
          onEnded={handlePauseOrEnd}
          className="w-full rounded-md bg-black max-h-72"
        />

        {confirmOpen && (
          <div className="bg-linen border border-line rounded-md p-3 flex flex-col gap-2">
            <div className="text-[12.5px] text-ink">Êtes-vous sûr(e) d&apos;avoir vu la vidéo en entier ?</div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleConfirmYes}
                className="bg-ink text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:bg-ink-soft"
              >
                Oui, j&apos;ai tout vu
              </button>
              <button onClick={handleConfirmNo} className="text-[12px] text-slate hover:text-ink">
                Non, revoir
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 bg-pebble rounded-full overflow-hidden">
            <div className="h-full bg-sage" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-[11px] text-slate w-24 text-right">
            {saving ? "Enregistrement…" : `${percent}% visionné`}
          </span>
        </div>
        {percent > 0 && percent < 100 && !!lastPositionSeconds && (
          <div className="text-[10.5px] text-slate">
            Reprise à {Math.floor(lastPositionSeconds / 60)}:{String(lastPositionSeconds % 60).padStart(2, "0")}
          </div>
        )}

        {skippedAt && (
          <div>
            <Pill tone="danger">Passé sans visionnage complet</Pill>
          </div>
        )}

        {allowSkip && !skippedAt && percent < 100 && !confirmOpen && (
          confirmSkipOpen ? (
            <div className="bg-linen border border-line rounded-md p-3 flex flex-col gap-2">
              <div className="text-[12.5px] text-ink">
                Vous n&apos;aurez pas regardé cette vidéo en entier. Cela peut affecter la preuve de suivi de votre
                formation.
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleSkip}
                  disabled={skipping}
                  className="bg-rust text-white text-[12px] font-medium rounded-md px-3 py-1.5 hover:opacity-90 disabled:opacity-60"
                >
                  {skipping ? "…" : "Passer quand même"}
                </button>
                <button onClick={() => setConfirmSkipOpen(false)} className="text-[12px] text-slate hover:text-ink">
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmSkipOpen(true)}
              className="text-[11.5px] text-slate hover:text-ink underline decoration-line self-start"
            >
              Passer cette vidéo
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <a href={fileUrl} target="_blank" rel="noreferrer" className="text-[12.5px] text-ink underline decoration-line hover:decoration-ink">
        Consulter le document
      </a>
      {percent >= 100 ? (
        <span className="text-[11px] text-sage">Terminé</span>
      ) : (
        <button
          onClick={() => { setPercent(100); save(100, 0, true); }}
          disabled={saving}
          className="text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink disabled:opacity-60"
        >
          {saving ? "…" : "Marquer comme terminé"}
        </button>
      )}
    </div>
  );
}
