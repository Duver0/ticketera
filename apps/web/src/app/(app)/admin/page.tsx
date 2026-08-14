'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/lib/auth-context';
import {
  useProjectMembers,
  useProjects,
  useUpdateUserRole,
  useUsers,
} from '@/lib/api-hooks';
import {useToast} from '@/components/ui/Toast';
import {CreateProjectDialog} from '@/components/CreateProjectDialog';
import {Card, CardBody, CardHeader} from '@/components/ui/Card';
import {Spinner} from '@/components/ui/Spinner';
import {Avatar} from '@/components/ui/Avatar';
import {Select} from '@/components/ui/Field';
import {Button} from '@/components/ui/Button';
import {ROLE_LABELS} from '@/lib/constants';
import type {Role} from '@ticketera/types';

const ROLES: Role[] = ['admin', 'agente', 'usuario'];

export default function AdminPage(): React.JSX.Element {
  const {role} = useAuth();
  const {data: users = [], isLoading} = useUsers();
  const updateRole = useUpdateUserRole();
  const {toast} = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (role !== 'admin') {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger-bg p-6 text-center">
        <p className="font-medium text-danger-fg">Acceso denegado</p>
        <p className="mt-1 text-sm text-content-secondary">Esta sección requiere rol administrador.</p>
      </div>
    );
  }

  const adminCount = users.filter((u) => u.role === 'admin').length;

  const changeRole = (id: string, next: Role) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    if (user.role === 'admin' && next !== 'admin' && adminCount <= 1) {
      toast('No puedes degradar al único administrador', 'error');
      return;
    }
    updateRole.mutate(
      {id, role: next},
      {
        onSuccess: () => toast('Rol actualizado', 'success'),
        onError: (e) => toast(e.message, 'error'),
      },
    );
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-content">Administración</h1>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">Usuarios</h2>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-content-tertiary">
                    <th className="px-3 py-2">Usuario</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((u) => (
                    <tr key={u.id} className="bg-surface">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Avatar size="sm" name={u.name} image={u.image} />
                          <span className="font-medium text-content">{u.name ?? '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-content-secondary">{u.email}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value as Role)}
                          className="h-9 w-40"
                          aria-label={`Rol de ${u.name ?? u.email}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <ProjectsAdmin expanded={expanded} setExpanded={setExpanded} />
    </div>
  );
}

function ProjectsAdmin({expanded, setExpanded}: {expanded: string | null; setExpanded: (v: string | null) => void}): React.JSX.Element {
  const {data: projects = []} = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-content">Proyectos y miembros</h2>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            Nuevo proyecto
          </Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-2">
        {projects.length === 0 && <p className="text-sm text-content-tertiary">Sin proyectos.</p>}
        {projects.map((p) => (
          <div key={p.id} className="rounded-lg border border-line">
              <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-content hover:bg-surface-muted"
                  aria-expanded={expanded === p.id}
                >
                  <span className="truncate">
                    <span className="font-mono text-xs text-content-tertiary">{p.key}</span> · {p.name}
                  </span>
                </button>
                <Link
                  href={`/projects/${p.id}`}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-surface-muted"
                >
                  Abrir
                </Link>
                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="shrink-0 text-content-tertiary"
                  aria-label={expanded === p.id ? 'Colapsar' : 'Expandir'}
                >
                  {expanded === p.id ? '−' : '+'}
                </button>
              </div>
            {expanded === p.id && <ProjectMembers projectId={p.id} />}
          </div>
        ))}
      </CardBody>
      <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </Card>
  );
}

function ProjectMembers({projectId}: {projectId: string}): React.JSX.Element {
  const {data: members = [], isLoading} = useProjectMembers(projectId);
  if (isLoading) return <div className="px-3 py-2"><Spinner /></div>;
  return (
    <ul className="divide-y divide-line border-t border-line px-3 py-1">
      {members.length === 0 && (
        <li className="py-2 text-sm text-content-tertiary">Sin miembros.</li>
      )}
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between py-2 text-sm">
          <span className="flex items-center gap-2">
            <Avatar size="sm" name={m.user.name} />
            <span className="text-content">{m.user.name ?? m.user.email}</span>
          </span>
          <span className="text-xs uppercase text-content-tertiary">{m.roleInProject}</span>
        </li>
      ))}
    </ul>
  );
}
