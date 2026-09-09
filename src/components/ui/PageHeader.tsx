import type { ReactNode } from 'react';
import { cn } from '../../lib/format';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[1.08] sm:text-[36px] lg:text-heading-lg font-light text-ink tracking-[-1.2px] lg:tracking-[-2.3px]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] sm:text-[16px] text-fossil mt-1.5 sm:mt-2 max-w-2xl leading-normal">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {actions}
        </div>
      )}
    </div>
  );
}
