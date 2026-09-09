interface LineSeries {
  name: string;
  values: number[];
  color: string;
  dashed?: boolean;
}

interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  // Indeks mulai area forecast (digambar lebih pudar)
  forecastFrom?: number;
  formatValue?: (v: number) => string;
  className?: string;
}

const W = 720;
const H = 220;
const PAD_X = 8;
const PAD_Y = 16;

// Line chart SVG flat — stroke ink, forecast dashed, tanpa grid berat.
export function LineChart({ labels, series, height = 220, forecastFrom, className }: LineChartProps) {
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const span = max - min || 1;
  const n = labels.length;
  const x = (i: number) => PAD_X + (i / Math.max(n - 1, 1)) * (W - PAD_X * 2);
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);

  const pathFor = (values: number[], from = 0, to = values.length - 1) =>
    values
      .slice(from, to + 1)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');

  const labelIdx = [0, Math.floor(n / 2), n - 1];

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height, width: '100%' }} preserveAspectRatio="none" role="img">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={PAD_Y + f * (H - PAD_Y * 2)}
            y2={PAD_Y + f * (H - PAD_Y * 2)}
            stroke="#eae6e1"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {series.map((s) => (
          <g key={s.name}>
            {forecastFrom !== undefined && forecastFrom > 0 && forecastFrom < n ? (
              <>
                <path
                  d={pathFor(s.values, 0, forecastFrom)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.75"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                />
                <path
                  d={pathFor(s.values, forecastFrom, n - 1)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.75"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="4 4"
                  opacity="0.55"
                />
              </>
            ) : (
              <path
                d={pathFor(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth="1.75"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
            )}
          </g>
        ))}

        {forecastFrom !== undefined && forecastFrom > 0 && forecastFrom < n && (
          <circle cx={x(forecastFrom)} cy={y(series[0].values[forecastFrom])} r="4" fill="#dbf570" stroke="#1c1c1c" strokeWidth="1.25" />
        )}
      </svg>

      <div className="mt-1 flex justify-between border-t border-ash pt-2 text-caption text-fossil">
        {labelIdx.map((i) => (
          <span key={i}>{labels[i]}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-caption text-fossil">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-5"
              style={{ background: s.color, ...(s.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` } : {}) }}
            />
            {s.name}
          </span>
        ))}
        {forecastFrom !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-5" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #706f6c 0 4px, transparent 4px 7px)' }} />
            Proyeksi AI
          </span>
        )}
      </div>
    </div>
  );
}
