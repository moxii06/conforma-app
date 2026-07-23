// Hand-rolled SVG bar chart — no charting library, matching the scaffold's
// existing hand-styled progress bars (see the Qualiopi Indicators tab).
// Single-hue by design: every chart here plots one series' magnitude across
// an ordered set of categories (pipeline stage, week, journey step), not
// several competing identities, so a categorical palette isn't needed —
// see the dataviz skill's color-formula guidance on when hue assignment
// applies. A native <title> per bar gives a minimal hover tooltip.
const W = 400;
const H = 160;
const PAD_BOTTOM = 28;
const PAD_TOP = 20;

export function BarChart({
  data,
  color = "#4B6358", // sage
  formatValue = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const usableWidth = W;
  const slot = usableWidth / Math.max(data.length, 1);
  const plotHeight = H - PAD_BOTTOM - PAD_TOP;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Graphique en barres">
      <line x1={0} y1={H - PAD_BOTTOM} x2={W} y2={H - PAD_BOTTOM} stroke="#E2DFD6" strokeWidth={1} />
      {data.map((d, i) => {
        const barHeight = max > 0 ? (d.value / max) * plotHeight : 0;
        const x = i * slot;
        const barWidth = Math.min(slot * 0.5, 40);
        const barX = x + (slot - barWidth) / 2;
        const barY = H - PAD_BOTTOM - barHeight;
        return (
          <g key={`${d.label}-${i}`}>
            <title>
              {d.label}: {formatValue(d.value)}
            </title>
            <rect x={barX} y={barY} width={barWidth} height={Math.max(barHeight, 1.5)} rx={3} fill={color} />
            <text
              x={x + slot / 2}
              y={barY - 5}
              textAnchor="middle"
              fontSize={11}
              fill="#1B2430"
              fontWeight={600}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {formatValue(d.value)}
            </text>
            <text x={x + slot / 2} y={H - PAD_BOTTOM + 14} textAnchor="middle" fontSize={9.5} fill="#6A6D74">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
