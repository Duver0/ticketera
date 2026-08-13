import {forwardRef, type InputHTMLAttributes, type ReactNode} from 'react';
import {cn} from '@/lib/utils';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  hint?: string;
}

/** Envoltura estándar de campo: label + control + error/mensaje. */
export function Field({label, htmlFor, error, required, children, className, hint}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-content-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-content-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

const baseControl =
  'w-full rounded-lg border bg-surface px-3 text-sm text-content placeholder:text-content-tertiary ' +
  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {invalid, className, ...props},
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseControl, 'h-10', invalid ? 'border-danger' : 'border-line', className)}
      {...props}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {invalid, className, ...props},
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseControl, 'min-h-[96px] py-2', invalid ? 'border-danger' : 'border-line', className)}
      {...props}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {invalid, className, children, ...props},
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseControl, 'h-10', invalid ? 'border-danger' : 'border-line', className)}
      {...props}
    >
      {children}
    </select>
  );
});
