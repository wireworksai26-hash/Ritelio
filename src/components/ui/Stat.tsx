import type { ReactNode } from 'react';
import { cn } from '../../lib/format';
import { Icon } from '../icons/Icon';
import { Card } from './Card';

interface StatProps {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  hint?: string;
  className?: string;
}

export function Stat({ label, value, delta, trend, hint, className }: StatProps) {
  return (
    <Card className={cn('p-3.5 sm:p-5 transition-all duration-200 hover:border-pebble/80 flex flex-col justify-between', className)}>
      <div>
        <p className="text-caption text-fossil truncate">{label}</p>
        <p className="tnum font-light text-ink mt-1.5 sm:mt-2 text-[20px] sm:text-[24px] lg:text-heading leading-[1.15] tracking-[-0.6px] sm:tracking-[-1.12px] truncate">
          {value}
        </p>
      </div>
      {(delta || hint) && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-fossil flex-wrap">
          {trend === 'up' && <Icon name="trending-up" size={13} className="text-olive shrink-0" />}
          {trend === 'down' && <Icon name="trending-down" size={13} className="text-fossil shrink-0" />}
          {delta && <span className="tnum">{delta}</span>}
          {hint && <span className="truncate">{hint}</span>}
        </p>
      )}
    </Card>
  );
}
