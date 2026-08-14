'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useProjects} from '@/lib/api-hooks';
import {CreateProjectDialog} from '@/components/CreateProjectDialog';
import {Card, CardBody} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Spinner} from '@/components/ui/Spinner';

/**
 * Listado de proyectos del usuario (el API solo devuelve los de su org/membresía).
 * Cada proyecto enlaza a su página de detalle (tickets + equipo).
 */
export default function ProjectsPage(): React.JSX.Element {
  const {data: projects = [], isLoading} = useProjects();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-content">Proyectos</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Equipos y trabajo de tu organización.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Nuevo proyecto</Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardBody className="text-center text-sm text-content-secondary">
            Aún no tienes proyectos.{' '}
            <button onClick={() => setShowCreate(true)} className="text-brand hover:underline">
              Créa uno
            </button>
            .
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="rounded-xl border border-line bg-surface p-4 shadow-sm transition-colors hover:border-brand hover:bg-surface-muted"
            >
              <p className="font-mono text-xs text-content-tertiary">{p.key}</p>
              <p className="mt-1 font-semibold text-content">{p.name}</p>
              {p.description && (
                <p className="mt-1 line-clamp-2 text-sm text-content-secondary">{p.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}

      <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
