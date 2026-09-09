import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/format';

const baseField =
  'w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[15px] text-ink placeholder:text-pebble transition-colors duration-150 hover:border-pebble focus:border-ink focus:outline-none';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <input ref={ref} id={inputId} className={cn(baseField, className)} {...rest} />
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, id, className, children, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <select ref={ref} id={inputId} className={cn(baseField, 'appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <textarea ref={ref} id={inputId} className={cn(baseField, 'min-h-[96px] resize-y', className)} {...rest} />
    </Field>
  );
});

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-caption text-fossil">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-caption text-pebble">{hint}</p>}
    </div>
  );
}
