import { cn } from '../../lib/format';

// Tab segment control — tab aktif di atas pill Sand (DESIGN.md)
interface TabsProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ options, value, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full border-b border-ash sm:border-0 pb-1 sm:pb-0', className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-lg px-3.5 py-1.5 sm:px-4 sm:py-2 text-body-sm sm:text-[15px] whitespace-nowrap transition-colors duration-150',
            value === opt.value ? 'bg-sand text-ink font-medium' : 'text-fossil hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
