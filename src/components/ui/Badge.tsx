import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/format';
import { Icon, type IconName } from '../icons/Icon';

type BadgeVariant = 'accent' | 'neutral' | 'outline' | 'ink';

const variants: Record<BadgeVariant, string> = {
  // Study tag badge: chartreuse sebagai highlight kecil, teks selalu gelap kontras tinggi
  accent: 'bg-chartreuse text-[#1c1c1c] font-medium',
  neutral: 'bg-sand text-smoke',
  outline: 'bg-transparent text-fossil border border-ash',
  ink: 'bg-ink text-paper',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: IconName;
}

export function Badge({ variant = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  const hasDisplayClass = className && (/\b(hidden|inline-flex|flex|inline-block|block)\b/.test(className));
  return (
    <span
      className={cn(
        !hasDisplayClass && 'inline-flex',
        'items-center gap-1 rounded-md px-2 py-0.5 text-caption font-normal whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={12} strokeWidth={1.75} />}
      {children}
    </span>
  );
}
