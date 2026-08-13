'use client';

import {useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {
  useCreateTicket,
  useProjectLabelsFor,
  useProjectMembers,
  useProjects,
} from '@/lib/api-hooks';
import {Field, Input, Select, Textarea} from '@/components/ui/Field';
import {Button} from '@/components/ui/Button';
import {Spinner} from '@/components/ui/Spinner';
import {PRIORITY_LABELS, PRIORITY_ORDER, TYPE_LABELS} from '@/lib/constants';
import type {CreateTicketDto, TicketDto, TicketType, Priority} from '@ticketera/types';

const schema = z.object({
  projectId: z.string().min(1, 'Selecciona un proyecto'),
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres'),
  description: z.string().optional(),
  type: z.enum(['bug', 'feature', 'tarea', 'epic']),
  priority: z.enum(['baja', 'media', 'alta', 'urgente']),
  assigneeId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
});

export type TicketFormValues = z.infer<typeof schema>;

export function TicketForm({
  defaultProjectId,
  onSuccess,
  onCancel,
}: {
  defaultProjectId?: string;
  onSuccess?: (ticket: TicketDto) => void;
  onCancel?: () => void;
}): React.JSX.Element {
  const {data: projects = [], isLoading: loadingProjects} = useProjects();
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');

  const {data: members = []} = useProjectMembers(projectId || undefined);
  const {data: labels = []} = useProjectLabelsFor(projectId || undefined);
  const create = useCreateTicket();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: {errors},
  } = useForm<TicketFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: defaultProjectId ?? '',
      title: '',
      description: '',
      type: 'tarea',
      priority: 'media',
      assigneeId: '',
      labelIds: [],
    },
  });

  const selectedLabels = watch('labelIds') ?? [];

  const onSubmit = (values: TicketFormValues) => {
    const body: CreateTicketDto = {
      projectId: values.projectId,
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      type: values.type as TicketType,
      priority: values.priority as Priority,
      assigneeId: values.assigneeId || undefined,
      labelIds: values.labelIds && values.labelIds.length ? values.labelIds : undefined,
    };
    create.mutate(body, {
      onSuccess: (ticket) => onSuccess?.(ticket),
      onError: (e) => {
        // El padre gestiona el toast; aquí solo detenemos el estado de carga.
        // eslint-disable-next-line no-console
        console.error(e.message);
      },
    });
  };

  if (loadingProjects) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface-subtle p-4 text-sm text-content-secondary">
        No tienes proyectos. Crea uno primero (panel de administración) para poder registrar tickets.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Proyecto" htmlFor="projectId" required error={errors.projectId?.message}>
        <Select
          id="projectId"
          invalid={Boolean(errors.projectId)}
          {...register('projectId')}
          onChange={(e) => {
            setProjectId(e.target.value);
            setValue('projectId', e.target.value, {shouldValidate: true});
            setValue('assigneeId', '');
            setValue('labelIds', []);
          }}
        >
          <option value="">Selecciona…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Título" htmlFor="title" required error={errors.title?.message}>
        <Input id="title" invalid={Boolean(errors.title)} placeholder="Resume el problema o tarea" {...register('title')} />
      </Field>

      <Field label="Descripción" htmlFor="description">
        <Textarea id="description" placeholder="Detalles, pasos para reproducir, criterios de aceptación…" {...register('description')} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="type">
          <Select id="type" {...register('type')}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridad" htmlFor="priority">
          <Select id="priority" {...register('priority')}>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {projectId && (
        <Field label="Asignado" htmlFor="assigneeId" hint="Opcional">
          <Select id="assigneeId" {...register('assigneeId')}>
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name ?? m.user.email}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {projectId && labels.length > 0 && (
        <Field label="Etiquetas" hint="Opcional">
          <div className="flex flex-wrap gap-2 rounded-lg border border-line p-3">
            {labels.map((l) => {
              const checked = selectedLabels.includes(l.id);
              return (
                <label
                  key={l.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selectedLabels, l.id]
                        : selectedLabels.filter((id) => id !== l.id);
                      setValue('labelIds', next, {shouldValidate: false});
                    }}
                  />
                  {l.name}
                </label>
              );
            })}
          </div>
        </Field>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={create.isPending}>
          Crear ticket
        </Button>
      </div>
    </form>
  );
}
