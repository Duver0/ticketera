import {cn} from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  tone?: 'neutral' | 'info' | 'success';
}

/** Badge genérico (etiquetas, tipo de ticket, etc.). */
export function Badge({children, className, tone = 'neutral'}: BadgeProps): React.JSX.Element {
  const tones = {
    neutral: 'bg-neutral-bg text-neutral-fg',
    info: 'bg-info-bg text-info-fg',
    success: 'bg-success-bg text-success-fg',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
