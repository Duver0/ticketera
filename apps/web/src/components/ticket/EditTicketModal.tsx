'use client';

import {useState} from 'react';
import {useUpdateTicket} from '@/lib/api-hooks';
import {useToast} from '@/components/ui/Toast';
import {Modal} from '@/components/ui/Modal';
import {Button} from '@/components/ui/Button';
import {Field, Input, Select, Textarea} from '@/components/ui/Field';
import {PRIORITY_LABELS, PRIORITY_ORDER, TYPE_LABELS} from '@/lib/constants';
import {useAuth} from '@/lib/auth-context';
import type {Priority, ProjectMemberDto, TicketDto, TicketType, UpdateTicketDto} from '@ticketera/types';

/** Modal de edición de ticket (título, descripción, prioridad, tipo, asignado). */
export function EditTicketModal({
  ticket,
  members,
  onClose,
}: {
  ticket: TicketDto;
  members: ProjectMemberDto[];
  onClose: () => void;
}): React.JSX.Element {
  const update = useUpdateTicket(ticket.id);
  const {toast} = useToast();
  const {user} = useAuth();

  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? '');
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [type, setType] = useState<TicketType>(ticket.type);
  const [assigneeId, setAssigneeId] = useState<string>(ticket.assigneeId ?? '');

  const canEdit =
    user?.id === ticket.reporterId ||
    user?.id === ticket.assigneeId ||
    user?.role === 'agente' ||
    user?.role === 'admin';

  const save = () => {
    const body: UpdateTicketDto = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      type,
      assigneeId: assigneeId || null,
    };
    update.mutate(body, {
      onSuccess: () => {
        toast('Ticket actualizado', 'success');
        onClose();
      },
      onError: (e) => toast(e.message, 'error'),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar ticket"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={update.isPending} disabled={!canEdit}>
            Guardar
          </Button>
        </>
      }
    >
      {!canEdit && (
        <p className="mb-3 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          Solo el reportero, el asignado o un agente/admin pueden editar este ticket.
        </p>
      )}
      <div className="space-y-3">
        <Field label="Título" htmlFor="edit-title">
          <Input id="edit-title" value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Descripción" htmlFor="edit-desc">
          <Textarea
            id="edit-desc"
            value={description}
            disabled={!canEdit}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="edit-type">
            <Select id="edit-type" value={type} disabled={!canEdit} onChange={(e) => setType(e.target.value as TicketType)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              </Select>
          </Field>
          <Field label="Prioridad" htmlFor="edit-prio">
            <Select
              id="edit-prio"
              value={priority}
              disabled={!canEdit}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Asignado" htmlFor="edit-assignee">
          <Select
            id="edit-assignee"
            value={assigneeId}
            disabled={!canEdit}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name ?? m.user.email}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
