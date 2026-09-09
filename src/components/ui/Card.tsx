import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/format';

// Paper card: flat, 1px hairline border, radius 12 (DESIGN.md: elevation = none)
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-paper border border-ash rounded-xl', className)} {...rest} />;
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 sm:gap-4 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[18px] sm:text-heading-sm font-light text-ink leading-snug">{title}</h3>
        {subtitle && <p className="text-body-sm text-fossil mt-0.5 sm:mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 sm:px-6 pb-4 sm:pb-6', className)} {...rest} />;
}
