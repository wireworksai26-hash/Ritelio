import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sand text-smoke mb-4">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-[17px] text-ink">{title}</p>
      {body && <p className="text-body-sm text-fossil mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
