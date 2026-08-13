'use client';

import {useTicketHistory} from '@/lib/api-hooks';
import {Spinner} from '@/components/ui/Spinner';
import {StatusPill} from '@/components/ui/StatusPill';
import {formatDateTime} from '@/lib/utils';

/** Línea de tiempo del historial: actor y fromState → toState con colores. */
export function TicketHistory({ticketId}: {ticketId: string}): React.JSX.Element {
  const {data, isLoading} = useTicketHistory(ticketId);

  if (isLoading) return <Spinner />;

  const items = data ?? [];

  if (items.length === 0) {
    return <p className="text-sm text-content-tertiary">Sin cambios de estado registrados.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {items.map((h) => (
        <li key={h.id} className="relative">
          <span
            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand"
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-content">{h.actor.name ?? 'Usuario'}</span>
            <span className="text-content-secondary">cambió</span>
            <StatusPill state={h.fromState} size="sm" />
            <span aria-hidden>→</span>
            <StatusPill state={h.toState} size="sm" />
          </div>
          <p className="mt-0.5 text-xs text-content-tertiary">{formatDateTime(h.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
