"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Handwritten-signature capture on a canvas, for the émargement screen.
 *
 * Built rather than pulled from a library: the whole need is "draw a line
 * where the finger goes, hand back a PNG", and a dependency for that would
 * cost more than it saves. Pointer events cover mouse, stylus and touch in
 * one code path.
 *
 * The canvas is sized from its own layout box × devicePixelRatio, otherwise
 * strokes render blurry on the retina tablets this is meant for.
 */
export function SignaturePad({
  onChange,
  disabled = false,
  height = 130,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1F1D1A";
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Keeps the stroke following a finger that slides outside the box mid-way
    // instead of stopping dead at the edge.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFrom(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(hasInk ? canvas.toDataURL("image/png") : null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvasRef}
        style={{ height }}
        // touch-none stops the browser from scrolling the page while someone
        // is signing — without it a finger stroke pans the list instead.
        className={`w-full touch-none rounded-md border bg-white ${
          disabled ? "border-line opacity-50" : "border-ash"
        }`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Zone de signature"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate">{hasInk ? "Signature saisie" : "Signez dans le cadre"}</span>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || disabled}
          className="text-[11.5px] text-slate hover:text-ink underline decoration-line disabled:opacity-40"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
