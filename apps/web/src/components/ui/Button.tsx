import {forwardRef, type ButtonHTMLAttributes} from 'react';
import {cn} from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg hover:bg-brand-hover disabled:bg-brand/60 shadow-sm',
  secondary:
    'bg-surface text-content border border-line hover:bg-surface-muted disabled:opacity-60',
  ghost: 'text-content-secondary hover:bg-surface-muted disabled:opacity-60',
  danger: 'bg-danger text-danger-fg hover:bg-danger/90 disabled:bg-danger/60 shadow-sm',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

/** Botón accesible con estados hover/focus/disabled/loading. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props},
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});
