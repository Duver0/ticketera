'use client';

import {useEffect, useMemo, useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {useAuth} from '@/lib/auth-context';
import {
  useAddProjectMember,
  useProject,
  useProjectCandidates,
  useProjectMembers,
  useRemoveProjectMember,
  useTickets,
  useUpdateProjectMemberRole,
} from '@/lib/api-hooks';
import {ApiClientError} from '@/lib/api';
import {useToast} from '@/components/ui/Toast';
import {Card, CardBody, CardHeader} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Field, Input, Select} from '@/components/ui/Field';
import {Spinner} from '@/components/ui/Spinner';
import {Avatar} from '@/components/ui/Avatar';
import {Tabs} from '@/components/ui/Tabs';
import {TicketTable} from '@/components/TicketTable';
import {PROJECT_ROLE_LABELS} from '@/lib/constants';
import type {OrganizationMemberDto, ProjectMemberDto, ProjectRole} from '@ticketera/types';

const PROJECT_ROLES: ProjectRole[] = ['admin', 'supervisor', 'operador'];

/**
 * Página de detalle de un proyecto: pestañas "Tickets" y "Equipo".
 * El backend ya filtra la visibilidad de tickets según el rol en el proyecto,
 * y la gestión de equipo solo la permiten admin global / admin o supervisor de
 * proyecto (el backend responde 403 en caso contrario).
 */
export default function ProjectDetailPage(): React.JSX.Element {
  const params = useParams<{id: string}>();
  const projectId = params.id;
  const {role, user} = useAuth();
  const [tab, setTab] = useState<'tickets' | 'equipo'>('tickets');

  const {data: project, isLoading, error} = useProject(projectId);
  const {data: members = [], isLoading: loadingMembers} = useProjectMembers(projectId);
  const {data: tickets = []} = useTickets(projectId ? {projectId} : undefined);

  const accessDenied =
    error instanceof ApiClientError &&
    (error.code === 'NOT_PROJECT_MEMBER' || error.status === 403 || error.status === 404);

  // Rol del usuario actual en este proyecto (resuelto desde la membresía).
  const myProjectRole = useMemo<ProjectRole | undefined>(() => {
    if (!user) return undefined;
    return members.find((m) => m.userId === user.id)?.roleInProject;
  }, [members, user]);

  // admin global o admin/supervisor de proyecto gestionan el equipo.
  const isSupervisorOnly = myProjectRole === 'supervisor' && role !== 'admin';
  const canManageTeam =
    role === 'admin' || myProjectRole === 'admin' || myProjectRole === 'supervisor';

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (accessDenied || !project) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger-bg p-6 text-center">
        <p className="font-medium text-danger-fg">Acceso denegado</p>
        <p className="mt-1 text-sm text-content-secondary">
          No perteneces a este proyecto o no existe.
        </p>
        <Link href="/projects" className="mt-3 inline-block text-brand hover:underline">
          Volver a proyectos
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/projects"
        className="mb-3 inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content"
      >
        ← Proyectos
      </Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-content-tertiary">{project.key}</span>
            <h1 className="text-2xl font-semibold text-content">{project.name}</h1>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-content-secondary">{project.description}</p>
          )}
        </div>
        {myProjectRole && (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
            Tu rol: {PROJECT_ROLE_LABELS[myProjectRole]}
          </span>
        )}
      </div>

      {myProjectRole === 'operador' && (
        <div className="mb-5 rounded-lg border border-info/40 bg-info-bg px-4 py-3 text-sm text-info-fg">
          Solo ves los tickets que puedes tomar o que te asignaron.
        </div>
      )}

      <Tabs
        className="mb-5"
        tabs={[
          {key: 'tickets', label: 'Tickets'},
          {key: 'equipo', label: 'Equipo'},
        ]}
        value={tab}
        onChange={(k) => setTab(k as 'tickets' | 'equipo')}
      />

      {tab === 'tickets' ? (
        <TicketTable tickets={tickets} />
      ) : (
        <TeamPanel
          projectId={projectId}
          members={members}
          loading={loadingMembers}
          canManageTeam={canManageTeam}
          isSupervisorOnly={isSupervisorOnly}
        />
      )}
    </div>
  );
}

/** Panel de equipo: lista de miembros + gestión (si aplica). */
function TeamPanel({
  projectId,
  members,
  loading,
  canManageTeam,
  isSupervisorOnly,
}: {
  projectId: string;
  members: ProjectMemberDto[];
  loading: boolean;
  canManageTeam: boolean;
  isSupervisorOnly: boolean;
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!canManageTeam && (
        <div className="rounded-lg border border-line bg-surface-subtle px-4 py-3 text-sm text-content-secondary">
          No tienes permiso para gestionar el equipo de este proyecto.
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">
            Miembros ({members.length})
          </h2>
        </CardHeader>
        <CardBody className="space-y-2">
          {members.length === 0 && (
            <p className="text-sm text-content-tertiary">Sin miembros todavía.</p>
          )}
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              canManageTeam={canManageTeam}
              isSupervisorOnly={isSupervisorOnly}
              projectId={projectId}
            />
          ))}
        </CardBody>
      </Card>

      {canManageTeam && <AddMemberForm projectId={projectId} isSupervisorOnly={isSupervisorOnly} />}
    </div>
  );
}

/** Fila de miembro: nombre, rol y (si gestiona) selector de rol + quitar. */
function MemberRow({
  member,
  canManageTeam,
  isSupervisorOnly,
  projectId,
}: {
  member: ProjectMemberDto;
  canManageTeam: boolean;
  isSupervisorOnly: boolean;
  projectId: string;
}): React.JSX.Element {
  const {toast} = useToast();
  const updateRole = useUpdateProjectMemberRole(projectId);
  const remove = useRemoveProjectMember(projectId);

  const onRoleChange = (next: ProjectRole) => {
    if (next === member.roleInProject) return;
    updateRole.mutate(
      {userId: member.userId, roleInProject: next},
      {
        onSuccess: () => toast('Rol actualizado', 'success'),
        onError: (e) => toast(e.message, 'error'),
      },
    );
  };

  const onRemove = () => {
    remove.mutate(member.userId, {
      onSuccess: () => toast('Miembro eliminado', 'success'),
      onError: (e) => toast(e.message, 'error'),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
      <span className="flex items-center gap-2">
        <Avatar size="sm" name={member.user.name} image={member.user.image} />
        <span>
          <span className="text-sm font-medium text-content">
            {member.user.name ?? member.user.email}
          </span>
          <span className="block text-xs text-content-tertiary">{member.user.email}</span>
        </span>
      </span>

      <div className="flex items-center gap-2">
        {canManageTeam ? (
          <>
            <Select
              aria-label={`Rol de ${member.user.name ?? member.user.email}`}
              className="h-9 w-40"
              value={member.roleInProject}
              disabled={updateRole.isPending}
              onChange={(e) => onRoleChange(e.target.value as ProjectRole)}
            >
              {PROJECT_ROLES.map((r) => (
                // El supervisor no puede otorgar rol admin (el backend lo prohíbe).
                <option key={r} value={r} disabled={isSupervisorOnly && r === 'admin'}>
                  {PROJECT_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => onRemove()}>
              Quitar
            </Button>
          </>
        ) : (
          <span className="text-xs uppercase text-content-tertiary">
            {PROJECT_ROLE_LABELS[member.roleInProject]}
          </span>
        )}
      </div>
    </div>
  );
}

/** Formulario para añadir miembro: combobox de candidatos (misma org) + rol. */
function AddMemberForm({
  projectId,
  isSupervisorOnly,
}: {
  projectId: string;
  isSupervisorOnly: boolean;
}): React.JSX.Element {
  const {toast} = useToast();
  const add = useAddProjectMember(projectId);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<OrganizationMemberDto | null>(null);
  const [roleInProject, setRoleInProject] = useState<ProjectRole>('operador');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  // El backend ya filtra por org; no sugerirá usuarios de otra org.
  const {data: candidates = [], isFetching} = useProjectCandidates(projectId, debounced);

  const submit = () => {
    if (!selected) {
      toast('Selecciona un candidato', 'error');
      return;
    }
    // El supervisor no puede otorgar admin (el backend responde 403).
    const role = isSupervisorOnly && roleInProject === 'admin' ? 'supervisor' : roleInProject;
    add.mutate(
      {userId: selected.id, roleInProject: role},
      {
        onSuccess: () => {
          toast('Miembro añadido', 'success');
          setSelected(null);
          setQuery('');
          setDebounced('');
        },
        onError: (e) => {
          const code = e instanceof ApiClientError ? e.code : '';
          if (code === 'CANNOT_GRANT_PROJECT_ADMIN')
            toast('Un supervisor no puede otorgar rol admin', 'error');
          else if (code === 'USER_NOT_FOUND')
            toast('Ese usuario no pertenece a tu organización', 'error');
          else if (code === 'ORG_REQUIRED')
            toast('Debes pertenecer a una organización', 'error');
          else toast(e.message, 'error');
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-content">Añadir miembro</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <Field label="Buscar en tu organización" htmlFor="member-search">
          <Input
            id="member-search"
            value={query}
            placeholder="Nombre o email"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
          />
        </Field>

        {debounced.trim().length > 0 && !selected && (
          <ul className="max-h-48 overflow-y-auto rounded-lg border border-line">
            {isFetching && (
              <li className="px-3 py-2 text-sm text-content-tertiary">Buscando…</li>
            )}
            {!isFetching && candidates.length === 0 && (
              <li className="px-3 py-2 text-sm text-content-tertiary">Sin coincidencias en tu org.</li>
            )}
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    setQuery(`${c.name ?? ''} <${c.email}>`);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  <Avatar size="sm" name={c.name} />
                  <span>
                    <span className="font-medium text-content">{c.name ?? '—'}</span>
                    <span className="block text-xs text-content-tertiary">{c.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Rol en el proyecto" htmlFor="member-role" className="w-48">
            <Select
              id="member-role"
              value={roleInProject}
              onChange={(e) => setRoleInProject(e.target.value as ProjectRole)}
            >
              {PROJECT_ROLES.map((r) => (
                <option key={r} value={r} disabled={isSupervisorOnly && r === 'admin'}>
                  {PROJECT_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => submit()} loading={add.isPending} disabled={!selected}>
            Añadir miembro
          </Button>
        </div>
        {isSupervisorOnly && (
          <p className="text-xs text-content-tertiary">
            Como supervisor, no puedes otorgar el rol de admin de proyecto.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
