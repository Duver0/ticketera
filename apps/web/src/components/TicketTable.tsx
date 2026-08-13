'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {useAuth} from '@/lib/auth-context';
import {
  useTicketTransitions,
  useTransitionTicket,
  useUpdateTicket,
} from '@/lib/api-hooks';
import {useToast} from '@/components/ui/Toast';
import {StatusPill} from '@/components/ui/StatusPill';
import {PriorityBadge} from '@/components/ui/PriorityBadge';
import {Avatar} from '@/components/ui/Avatar';
import {Dropdown} from '@/components/ui/Dropdown';
import {EmptyState} from '@/components/ui/Spinner';
import {STATE_LABELS, TYPE_LABELS} from '@/lib/constants';
import {formatDateTime} from '@/lib/utils';
import type {TicketDto} from '@ticketera/types';

export function TicketTable({tickets}: {tickets: TicketDto[]}): React.JSX.Element {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No hay tickets"
        description="Prueba ajustando los filtros o crea un nuevo ticket."
      />
    );
  }
  return (
    <>
      {/* Tabla (escritorio) */}
      <div className="hidden overflow-hidden rounded-xl border border-line sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-content-tertiary">
              <th className="px-3 py-2.5">KEY</th>
              <th className="px-3 py-2.5">Título</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5">Prioridad</th>
              <th className="px-3 py-2.5">Asignado</th>
              <th className="px-3 py-2.5">Actualizado</th>
              <th className="px-3 py-2.5" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tickets.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Lista (móvil) */}
      <ul className="space-y-2 sm:hidden">
        {tickets.map((t) => (
          <li key={t.id}>
            <TicketCardMobile ticket={t} />
          </li>
        ))}
      </ul>
    </>
  );
}

function TicketRow({ticket}: {ticket: TicketDto}): React.JSX.Element {
  const router = useRouter();
  const {user} = useAuth();
  const {toast} = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const transitions = useTicketTransitions(menuOpen ? ticket.id : undefined);
  const transition = useTransitionTicket(ticket.id);
  const update = useUpdateTicket(ticket.id);

  const allowed = (transitions.data ?? []).filter((x) => x.allowed);

  const onTransition = (to: TicketDto['state']) => {
    transition.mutate(
      {to},
      {
        onSuccess: () => toast(`Ticket movido a ${STATE_LABELS[to]}`, 'success'),
        onError: (e) => toast(e.message, 'error'),
      },
    );
  };

  return (
    <tr
      className="cursor-pointer bg-surface hover:bg-surface-muted"
      onClick={() => router.push(`/tickets/${ticket.id}`)}
    >
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium text-content-secondary">
        {ticket.key}
      </td>
      <td className="px-3 py-2.5">
        <span className="font-medium text-content">{ticket.title}</span>
        <span className="ml-2 text-xs text-content-tertiary">{TYPE_LABELS[ticket.type]}</span>
      </td>
      <td className="px-3 py-2.5">
        <StatusPill state={ticket.state} size="sm" />
      </td>
      <td className="px-3 py-2.5">
        <PriorityBadge priority={ticket.priority} />
      </td>
      <td className="px-3 py-2.5">
        {ticket.assigneeId ? (
          <span className="flex items-center gap-2">
            <Avatar size="sm" name={ticket.assigneeId} />
            <span className="text-xs text-content-secondary">Asignado</span>
          </span>
        ) : (
          <span className="text-xs text-content-tertiary">Sin asignar</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-content-tertiary">
        {formatDateTime(ticket.updatedAt)}
      </td>
      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <Dropdown
          align="right"
          label="Acciones rápidas"
          trigger={
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-content-secondary hover:bg-surface-muted">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </span>
          }
          items={[
            {
              key: 'detail',
              label: 'Ver detalle',
              onSelect: () => router.push(`/tickets/${ticket.id}`),
            },
            {
              key: 'assign-me',
              label: 'Asignarme',
              disabled: ticket.assigneeId === user?.id,
              onSelect: () =>
                update.mutate(
                  {assigneeId: user?.id ?? null},
                  {onSuccess: () => toast('Ticket asignado', 'success'), onError: (e) => toast(e.message, 'error')},
                ),
            },
            ...allowed.map((a) => ({
              key: `move-${a.to}`,
              label: `Mover a ${STATE_LABELS[a.to]}`,
              onSelect: () => onTransition(a.to),
            })),
          ]}
        />
      </td>
    </tr>
  );
}

function TicketCardMobile({ticket}: {ticket: TicketDto}): React.JSX.Element {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="block rounded-xl border border-line bg-surface p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-content-tertiary">{ticket.key}</p>
          <p className="truncate font-medium text-content">{ticket.title}</p>
        </div>
        <StatusPill state={ticket.state} size="sm" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PriorityBadge priority={ticket.priority} />
        {ticket.assigneeId ? (
          <Avatar size="sm" name={ticket.assigneeId} />
        ) : (
          <span className="text-xs text-content-tertiary">Sin asignar</span>
        )}
      </div>
    </Link>
  );
}
