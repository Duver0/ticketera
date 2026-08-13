'use client';

import {useProjects, useProjectMembers, type TicketFilters} from '@/lib/api-hooks';
import {Field, Input, Select} from '@/components/ui/Field';
import {PRIORITY_LABELS, PRIORITY_ORDER, STATE_LABELS, STATE_ORDER, TYPE_LABELS} from '@/lib/constants';
import type {TicketStateValue, Priority, TicketType} from '@ticketera/types';

export interface TicketFiltersValue {
  q?: string;
  projectId?: string;
  state?: TicketStateValue;
  priority?: Priority;
  type?: TicketType;
  assigneeId?: string;
}

export function TicketFiltersBar({
  value,
  onChange,
}: {
  value: TicketFiltersValue;
  onChange: (next: TicketFiltersValue) => void;
}): React.JSX.Element {
  const {data: projects = []} = useProjects();
  const {data: members = []} = useProjectMembers(value.projectId);

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="lg:col-span-2">
        <Field label="Buscar" htmlFor="f-q">
          <Input
            id="f-q"
            placeholder="Título o KEY…"
            value={value.q ?? ''}
            onChange={(e) => onChange({...value, q: e.target.value || undefined})}
          />
        </Field>
      </div>
      <Field label="Proyecto" htmlFor="f-project">
        <Select
          id="f-project"
          value={value.projectId ?? ''}
          onChange={(e) => onChange({...value, projectId: e.target.value || undefined, assigneeId: undefined})}
        >
          <option value="">Todos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Estado" htmlFor="f-state">
        <Select
          id="f-state"
          value={value.state ?? ''}
          onChange={(e) => onChange({...value, state: (e.target.value || undefined) as TicketStateValue | undefined})}
        >
          <option value="">Todos</option>
          {STATE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prioridad" htmlFor="f-prio">
        <Select
          id="f-prio"
          value={value.priority ?? ''}
          onChange={(e) => onChange({...value, priority: (e.target.value || undefined) as Priority | undefined})}
        >
          <option value="">Todas</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Asignado" htmlFor="f-assignee">
        <Select
          id="f-assignee"
          value={value.assigneeId ?? ''}
          onChange={(e) => onChange({...value, assigneeId: e.target.value || undefined})}
          disabled={!value.projectId}
        >
          <option value="">{value.projectId ? 'Todos' : 'Elige proyecto'}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user.name ?? m.user.email}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
