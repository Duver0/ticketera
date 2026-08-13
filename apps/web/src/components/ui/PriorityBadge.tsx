import {cn} from '@/lib/utils';
import type {Priority} from '@ticketera/types';
import {PRIORITY_LABELS} from '@/lib/constants';

export interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

/** Badge de prioridad (texto + color, nunca solo color). */
export function PriorityBadge({priority, className}: PriorityBadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        `bg-prio-${priority}-bg text-prio-${priority}-fg`,
        className,
      )}
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
