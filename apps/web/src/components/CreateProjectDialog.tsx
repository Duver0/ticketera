'use client';

import {useEffect} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useRouter} from 'next/navigation';
import {useCreateProject} from '@/lib/api-hooks';
import {ApiClientError} from '@/lib/api';
import {useToast} from '@/components/ui/Toast';
import {Modal} from '@/components/ui/Modal';
import {Button} from '@/components/ui/Button';
import {Field, Input, Textarea} from '@/components/ui/Field';
import type {CreateProjectDto, ProjectDto} from '@ticketera/types';

const schema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'La clave es requerida')
    .max(10, 'Máximo 10 caracteres')
    .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo'),
  name: z.string().trim().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
});

export type CreateProjectValues = z.infer<typeof schema>;

/**
 * Diálogo de creación de proyecto. Al enviar invoca useCreateProject y cierra.
 * El API asigna al usuario autenticado como admin del proyecto creado.
 */
export function CreateProjectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const create = useCreateProject();
  const {toast} = useToast();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: {errors},
  } = useForm<CreateProjectValues>({
    resolver: zodResolver(schema),
    defaultValues: {key: '', name: '', description: ''},
  });

  // Limpia el formulario al cerrar para no arrastrar valores entre aperturas.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = (values: CreateProjectValues) => {
    const body: CreateProjectDto = {
      key: values.key.trim().toUpperCase(),
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
    };
    create.mutate(body, {
      onSuccess: (project: ProjectDto) => {
        toast(`Proyecto ${project.key} creado`, 'success');
        onClose();
      },
      onError: (e) => {
        // 409 ORG_REQUIRED: el actor no pertenece a ninguna organización. En vez
        // de fallar en silencio, guiamos a crear/unirse a una org.
        if (e instanceof ApiClientError && e.code === 'ORG_REQUIRED') {
          toast(
            'Debes pertenecer a una organización para crear proyectos. Únete o crea una en "Mi organización".',
            'error',
          );
          router.push('/org');
          return;
        }
        toast(e.message, 'error');
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear proyecto"
      description="El proyecto quedará administrado por tu usuario."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="create-project-form" loading={create.isPending}>
            Crear proyecto
          </Button>
        </>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label="Clave" htmlFor="project-key" required error={errors.key?.message} hint="p.ej. SUP (se guarda en mayúsculas)">
          <Input
            id="project-key"
            autoComplete="off"
            invalid={Boolean(errors.key)}
            placeholder="SUP"
            aria-describedby={errors.key ? 'project-key-error' : undefined}
            {...register('key')}
          />
        </Field>
        <Field label="Nombre" htmlFor="project-name" required error={errors.name?.message}>
          <Input
            id="project-name"
            invalid={Boolean(errors.name)}
            placeholder="Soporte al cliente"
            aria-describedby={errors.name ? 'project-name-error' : undefined}
            {...register('name')}
          />
        </Field>
        <Field label="Descripción" htmlFor="project-desc">
          <Textarea
            id="project-desc"
            placeholder="Objetivo del proyecto (opcional)"
            {...register('description')}
          />
        </Field>
      </form>
    </Modal>
  );
}
