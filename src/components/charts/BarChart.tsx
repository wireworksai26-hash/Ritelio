import { useEffect, useRef } from 'react';
import { cn, formatIDR } from '../../lib/format';
import { gsap } from '../../lib/gsap';

interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
}

// Bar chart flat — animasi batang GSAP saat discroll, highlight chartreuse pada hari ini.
export function BarChart({ data, height = 180, className, formatValue = formatIDR }: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const max = Math.max(...data.map((d) => d.value), 1);

  // GSAP scroll trigger: batang grafik naik perlahan saat masuk ke viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const bars = el.querySelectorAll('.barchart-bar');
    const ctx = gsap.context(() => {
      gsap.fromTo(
        bars,
        { scaleY: 0, transformOrigin: 'bottom' },
        {
          scaleY: 1,
          duration: 0.5,
          stagger: 0.025,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 90%',
            once: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [data]);

  const firstDate = data[0]?.label ?? '';
  const midDate = data[Math.floor(data.length / 2)]?.label ?? '';
  const lastDate = data[data.length - 1]?.label ?? '';

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      <div className="flex items-end gap-1 sm:gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          return (
            <div key={i} className="group relative flex-1 flex flex-col justify-end h-full min-w-0">
              {/* Tooltip pada hover */}
              <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-caption text-paper opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-20 shadow-sm">
                <span className="text-[11px] text-fossil mr-1">{d.label}:</span>
                <span className="font-medium">{formatValue(d.value)}</span>
              </div>
              <div
                className={cn(
                  'barchart-bar w-full rounded-t-sm transition-colors duration-150',
                  isLast ? 'bg-chartreuse' : 'bg-ink group-hover:bg-smoke',
                )}
                style={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Label tanggal bersih & terbaca di HP tanpa potongan '2... 3...' */}
      <div className="mt-2.5 flex justify-between items-center border-t border-ash pt-2 text-caption text-fossil">
        <span>{firstDate}</span>
        <span className="hidden sm:inline text-smoke">{midDate}</span>
        <span className="font-medium text-ink">Hari ini ({lastDate})</span>
      </div>
    </div>
  );
}
