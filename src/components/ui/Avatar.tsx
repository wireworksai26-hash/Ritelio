import { cn } from '../../lib/format';

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name = 'Pengguna', size = 34, className }: AvatarProps) {
  const safeName = (name || 'Pengguna').trim();
  const initials =
    safeName
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0] || '')
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full bg-ink text-paper select-none', className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
