import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/format';
import { Icon, type IconName } from '../icons/Icon';

type Variant = 'primary' | 'ghost' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  // Filled dark button — aksi utama (DESIGN.md: Ink bg, Paper text, no shadow/gradient)
  primary: 'bg-ink text-paper border border-ink hover:bg-smoke active:bg-charcoal',
  // Outlined ghost — aksi sekunder
  ghost: 'bg-transparent text-ink border border-ink hover:bg-sand',
  // Quiet — aksi tersier di atas bone
  subtle: 'bg-sand text-ink border border-transparent hover:bg-ash',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-body-sm gap-1.5',
  md: 'px-5 py-2.5 text-[15px] gap-2',
  lg: 'px-6 py-3 text-[17px] gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, full, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-normal transition-colors duration-150',
        'disabled:opacity-40 disabled:pointer-events-none select-none',
        variantClasses[variant],
        sizeClasses[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
});
