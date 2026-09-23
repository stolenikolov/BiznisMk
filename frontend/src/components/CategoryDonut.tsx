/**
 * Ranked spending donut. Colours are assigned by rank from a fixed six-slot
 * palette, so a category keeps its colour as long as it keeps its position —
 * and the list beneath repeats the same order, because a ring alone never
 * carries the numbers.
 */
const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Hairline gap between neighbouring arcs, in path units. */
const ARC_GAP = 3;

export interface DonutSegment {
  key: string;
  percent: number;
  color: string;
}

export function CategoryDonut({
  segments,
  label,
  total,
  title,
}: {
  segments: DonutSegment[];
  label: string;
  total: string;
  title: string;
}) {
  // Each arc starts where the previous one ended, so the offsets are a running
  // total computed up front rather than mutated while rendering.
  const arcs = segments.map((segment, index) => {
    const start = segments
      .slice(0, index)
      .reduce((sum, previous) => sum + (previous.percent / 100) * CIRCUMFERENCE, 0);
    const length = (segment.percent / 100) * CIRCUMFERENCE;
    return { ...segment, start, dash: Math.max(length - ARC_GAP, 0) };
  });

  return (
    <div className="donut-wrap">
      <svg width="150" height="150" viewBox="0 0 160 160" role="img" aria-label={title}>
        <g style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px' }}>
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth="24"
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE}`}
              strokeDashoffset={-arc.start}
            />
          ))}
        </g>
      </svg>
      <div className="donut-centre">
        <span className="donut-centre-label">{label}</span>
        <span className="donut-centre-value">{total}</span>
      </div>
    </div>
  );
}
