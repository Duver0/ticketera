'use client';

import {useMemo, useState} from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useManyTransitions} from '@/lib/api-hooks';
import {useToast} from '@/components/ui/Toast';
import {Avatar} from '@/components/ui/Avatar';
import {StatusPill} from '@/components/ui/StatusPill';
import {PriorityBadge} from '@/components/ui/PriorityBadge';
import {Dropdown} from '@/components/ui/Dropdown';
import {STATE_LABELS, STATE_ORDER} from '@/lib/constants';
import {cn} from '@/lib/utils';
import type {TicketDto, TicketStateValue, TicketType} from '@ticketera/types';

export function KanbanBoard({tickets}: {tickets: TicketDto[]}): React.JSX.Element {
  const {toast} = useToast();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const ids = useMemo(() => tickets.map((t) => t.id), [tickets]);
  const {map: allowedMap} = useManyTransitions(ids);

  const transition = useMutation({
    mutationFn: (vars: {id: string; to: TicketStateValue}) =>
      api.post<TicketDto>(`/tickets/${vars.id}/transitions`, {to: vars.to}),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({queryKey: ['tickets']});
      qc.invalidateQueries({queryKey: ['transitions', vars.id]});
      toast(`Ticket movido a ${STATE_LABELS[vars.to]}`, 'success');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
    useSensor(KeyboardSensor),
  );

  const activeAllowed = activeId ? allowedMap.get(activeId) ?? [] : [];

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const onDragEnd = (e: DragEndEvent) => {
    const id = e.active.id as string;
    setActiveId(null);
    const overId = e.over?.id as TicketStateValue | undefined;
    if (!overId) return;
    const from = e.active.data.current?.state as TicketStateValue | undefined;
    if (!from || overId === from) return;
    const allowed = allowedMap.get(id) ?? [];
    if (allowed.includes(overId)) {
      transition.mutate({id, to: overId});
    } else {
      toast('Transición no permitida para tu rol', 'error');
    }
  };

  const byState = (state: TicketStateValue) => tickets.filter((t) => t.state === state);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STATE_ORDER.map((state) => {
          const allowedForActive = activeId ? activeAllowed.includes(state) : null;
          return (
            <Column
              key={state}
              state={state}
              count={byState(state).length}
              highlight={allowedForActive}
            >
              {byState(state).map((t) => (
                <KanbanCard
                  key={t.id}
                  ticket={t}
                  allowedStates={allowedMap.get(t.id) ?? []}
                  onMove={(to) => transition.mutate({id: t.id, to})}
                />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({
  state,
  count,
  highlight,
  children,
}: {
  state: TicketStateValue;
  count: number;
  highlight: boolean | null;
  children: React.ReactNode;
}): React.JSX.Element {
  const {setNodeRef, isOver} = useDroppable({id: state});
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface-subtle">
      <div
        className={cn(
          'flex items-center justify-between rounded-t-xl px-3 py-2 text-sm font-semibold',
          state === 'reabierto' && 'bg-state-reabierto-bg text-state-reabierto-fg',
          state !== 'reabierto' && 'text-content',
        )}
      >
        <StatusPill state={state} size="sm" />
        <span className="text-xs text-content-tertiary">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 p-2 transition-colors',
          isOver && 'bg-brand-soft',
          highlight === true && 'ring-2 ring-inset ring-brand',
          highlight === false && 'opacity-50',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function KanbanCard({
  ticket,
  allowedStates,
  onMove,
}: {
  ticket: TicketDto;
  allowedStates: TicketStateValue[];
  onMove: (to: TicketStateValue) => void;
}): React.JSX.Element {
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: ticket.id,
    data: {state: ticket.state},
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab rounded-lg border border-line bg-surface p-2.5 shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] text-content-tertiary">{ticket.key}</span>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Dropdown
            align="right"
            label="Mover a…"
            trigger={
              <span className="inline-flex h-6 w-6 items-center justify-center rounded text-content-tertiary hover:bg-surface-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </span>
            }
            items={
              allowedStates.length
                ? allowedStates.map((s) => ({
                    key: `mv-${s}`,
                    label: `Mover a ${STATE_LABELS[s]}`,
                    onSelect: () => onMove(s),
                  }))
                : [{key: 'none', label: 'Sin acciones', disabled: true, onSelect: () => {}}]
            }
          />
        </div>
      </div>
      <p className="mt-1 text-sm font-medium text-content">{ticket.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <PriorityBadge priority={ticket.priority} />
        <span className="text-[10px] uppercase text-content-tertiary">{ticket.type}</span>
      </div>
      {ticket.assigneeId && (
        <div className="mt-2">
          <Avatar size="sm" name={ticket.assigneeId} />
        </div>
      )}
    </div>
  );
}
