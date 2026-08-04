// Hand-rolled SVG area chart — same no-library stance as BarChart. Smooth
// Catmull-Rom curve over a soft gradient fill: the style the client picked
// at the P1 audit, transposed onto Jalon's light background and palette
// instead of the dark dashboard his reference screenshot came from.
// Reserved for ORDERED TIME series (weeks, months): interpolating a curve
// between unordered categories would invent a trend that doesn't exist, so
// the pipeline-by-stage chart deliberately stays a BarChart.
const W = 400;
const H = 160;
const PAD_BOTTOM = 28;
const PAD_TOP = 20;

type Pt = { x: number; y: number };

// Catmull-Rom → cubic Bézier. Control-point Y is clamped to the plot band:
// the spline overshoots on flat-then-spike series (e.g. five zero months
// then one payment), and an overshoot below the axis would flip the area
// fill under the baseline.
function smoothPath(pts: Pt[]): string {
  const yMin = PAD_TOP;
  const yMax = H - PAD_BOTTOM;
  const clamp = (y: number) => Math.min(yMax, Math.max(yMin, y));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function AreaChart({
  data,
  color = "#4B6358", // sage
  formatValue = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = W / Math.max(data.length, 1);
  const plotHeight = H - PAD_BOTTOM - PAD_TOP;
  const points: Pt[] = data.map((d, i) => ({
    x: i * slot + slot / 2,
    y: H - PAD_BOTTOM - (d.value / max) * plotHeight,
  }));

  // Server component, no useId — derive the gradient id from the color.
  // Two same-colored charts sharing one id is harmless (identical defs).
  const gradientId = `area-${color.replace("#", "")}`;
  const line = points.length > 1 ? smoothPath(points) : "";
  const area = line
    ? `${line} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD_BOTTOM} L ${points[0].x.toFixed(1)} ${H - PAD_BOTTOM} Z`
    : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Graphique en courbe">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Dotted baseline, like the reference — the solid axis is the bars' look. */}
      <line x1={0} y1={H - PAD_BOTTOM} x2={W} y2={H - PAD_BOTTOM} stroke="#E2DFD6" strokeWidth={1} strokeDasharray="2 3" />
      {area && <path d={area} fill={`url(#${gradientId})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />}
      {points.map((p, i) => (
        <g key={`${data[i].label}-${i}`}>
          <title>
            {data[i].label}: {formatValue(data[i].value)}
          </title>
          <circle cx={p.x} cy={p.y} r={2.8} fill={color} stroke="#FFFFFF" strokeWidth={1.2} />
          <text
            x={p.x}
            y={p.y - 7}
            textAnchor="middle"
            fontSize={11}
            fill="#1B2430"
            fontWeight={600}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {formatValue(data[i].value)}
          </text>
          <text x={p.x} y={H - PAD_BOTTOM + 14} textAnchor="middle" fontSize={9.5} fill="#6A6D74">
            {data[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}
