import { formatIDR, formatNumber } from '../../lib/format';

interface DonutDatum {
  label: string;
  value: number;
}

// Ramp monokrom + chartreuse untuk slice terbesar (aksen tunggal)
const PALETTE = ['#dbf570', '#1c1c1c', '#3c3c3c', '#706f6c', '#9e9b94', '#d2cec6'];

interface DonutChartProps {
  data: DonutDatum[];
  size?: number;
  formatValue?: (v: number) => string;
}

export function DonutChart({ data, size = 168, formatValue = formatIDR }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const frac = d.value / total;
      const slice = { ...d, frac, color: PALETTE[i % PALETTE.length], dash: frac * C, dashOffset: -offset * C };
      offset += frac;
      return slice;
    });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 160 160" width={size} height={size} role="img">
          <circle cx="80" cy="80" r={R} fill="none" stroke="#eae6e1" strokeWidth="18" />
          {slices.map((s, i) => (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={`${Math.max(s.dash - 1.5, 0.5)} ${C - s.dash + 1.5}`}
              strokeDashoffset={s.dashOffset}
              transform="rotate(-90 80 80)"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-caption text-fossil">Total</span>
          <span className="tnum text-[15px] text-ink">{formatValue(total)}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2 min-w-0">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-body-sm">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-ink truncate">{s.label}</span>
            <span className="tnum ml-auto text-fossil">{Math.round(s.frac * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { formatNumber };
