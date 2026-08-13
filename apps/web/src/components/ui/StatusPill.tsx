import {cn} from '@/lib/utils';
import type {TicketStateValue} from '@ticketera/types';
import {STATE_LABELS} from '@/lib/constants';

export interface StatusPillProps {
  state: TicketStateValue;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Indicador de estado de ticket: punto 8px + texto. Nunca usa solo color
 * (siempre texto + dot) para cumplir accesibilidad.
 */
export function StatusPill({state, size = 'md', className}: StatusPillProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        `bg-state-${state}-bg text-state-${state}-fg`,
        className,
      )}
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
      {STATE_LABELS[state]}
    </span>
  );
}
