import { Field } from '../ui/controls';

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
}

// Input angka: keyboard numerik di HP, font 16px (mencegah zoom otomatis iOS), angka tabular.
export function NumberField({ label, value, onChange, hint, step = '0.01', min = '0', max, placeholder }: NumberFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[16px] sm:text-[15px] text-ink tnum placeholder:text-pebble hover:border-pebble focus:border-ink focus:outline-none"
      />
    </Field>
  );
}
