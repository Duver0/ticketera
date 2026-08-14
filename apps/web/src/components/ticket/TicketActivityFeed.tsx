'use client';

import {useTicketActivity} from '@/lib/api-hooks';
import {AUDIT_FIELD_LABELS, STATE_LABELS} from '@/lib/constants';
import {formatDateTime} from '@/lib/utils';
import {Spinner} from '@/components/ui/Spinner';
import {StatusPill} from '@/components/ui/StatusPill';
import type {TicketActivityDto, TicketAuditField} from '@ticketera/types';

/**
 * Feed unificado de actividad de un ticket: mezcla transiciones de estado
 * (kind='state', de TicketHistory) y ediciones de campos (kind='edit',
 * de TicketAudit). Reemplaza la vista de solo-historial para mostrar también
 * la auditoría de cambios.
 */
export function TicketActivityFeed({ticketId}: {ticketId: string}): React.JSX.Element {
  const {data, isLoading} = useTicketActivity(ticketId);

  if (isLoading) return <Spinner />;

  const items = data ?? [];

  if (items.length === 0) {
    return <p className="text-sm text-content-tertiary">Sin actividad registrada.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {items.map((item: TicketActivityDto) => (
        <li key={item.id} className="relative">
          <span
            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand"
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-content">{item.actor.name ?? 'Usuario'}</span>
            {item.kind === 'state' ? (
              <>
                <span className="text-content-secondary">cambió el estado</span>
                {item.fromState && <StatusPill state={item.fromState} size="sm" />}
                {item.fromState && <span aria-hidden>→</span>}
                {item.toState && <StatusPill state={item.toState} size="sm" />}
              </>
            ) : (
              <span className="text-content-secondary">
                editó{' '}
                <span className="font-medium text-content">
                  {item.field ? AUDIT_FIELD_LABELS[item.field as TicketAuditField] : 'campo'}
                </span>
                <ActivityEditValue value={item.fromValue} />
                <span aria-hidden>→</span>
                <ActivityEditValue value={item.toValue} />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-content-tertiary">{formatDateTime(item.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

/** Muestra el valor de una edición; null se lee como "—" (p.ej. al tomar un ticket). */
function ActivityEditValue({value}: {value: string | null | undefined}): React.JSX.Element {
  if (value == null) {
    return <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-content-tertiary">—</span>;
  }
  // Si el valor coincide con un estado conocido (edición de 'state'), lo pintamos como pill.
  if (value in STATE_LABELS) {
    return <StatusPill state={value as keyof typeof STATE_LABELS} size="sm" />;
  }
  return <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-content">{value}</span>;
}
