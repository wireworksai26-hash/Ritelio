import { cn } from '../../lib/format';

// Logo Retalio: mark bar-chart chartreuse di atas kotak ink + wordmark serif.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1c1c1c" />
      <rect x="15" y="31" width="7.5" height="17" rx="2" fill="#dbf570" />
      <rect x="28.25" y="23" width="7.5" height="25" rx="2" fill="#dbf570" />
      <rect x="41.5" y="15" width="7.5" height="33" rx="2" fill="#dbf570" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 26 : 30} />
      <span className={cn('font-light tracking-[-0.02em] text-ink', compact ? 'text-heading-sm' : 'text-[24px] leading-none')}>
        Retalio
      </span>
    </span>
  );
}
