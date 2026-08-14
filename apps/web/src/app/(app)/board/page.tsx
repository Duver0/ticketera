'use client';

import {useEffect, useState} from 'react';
import {useProjects, useTickets} from '@/lib/api-hooks';
import {KanbanBoard} from '@/components/KanbanBoard';
import {CreateProjectDialog} from '@/components/CreateProjectDialog';
import {Field, Select} from '@/components/ui/Field';
import {Spinner, EmptyState} from '@/components/ui/Spinner';
import {Button} from '@/components/ui/Button';

export default function BoardPage(): React.JSX.Element {
  const {data: projects = [], isLoading: loadingProjects} = useProjects();
  const [projectId, setProjectId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0]?.id ?? '');
  }, [projects, projectId]);

  const {data: tickets = [], isLoading} = useTickets(
    projectId ? {projectId} : undefined,
  );

  if (loadingProjects) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <>
        <EmptyState
          title="Sin proyectos"
          description="Crea un proyecto para usar el tablero."
          action={<Button onClick={() => setShowCreate(true)}>Crear proyecto</Button>}
        />
        <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} />
      </>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-content">Tablero</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Arrastra las tarjetas a columnas válidas para tu rol. Resaltadas = permitidas.
          </p>
        </div>
        <div className="w-64">
          <Field label="Proyecto" htmlFor="board-project">
            <Select
              id="board-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <KanbanBoard tickets={tickets} />
      )}
    </div>
  );
}
