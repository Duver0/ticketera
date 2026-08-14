'use client';

import {useMemo, useState} from 'react';
import {useParams, useRouter} from 'next/navigation';
import Link from 'next/link';
import {
  useProjectMembers,
  useProjects,
  useTicket,
} from '@/lib/api-hooks';
import {TransitionActions} from '@/components/ticket/TransitionActions';
import {TicketHistory} from '@/components/ticket/TicketHistory';
import {TicketActivityFeed} from '@/components/ticket/TicketActivityFeed';
import {CommentSection} from '@/components/ticket/CommentSection';
import {EditTicketModal} from '@/components/ticket/EditTicketModal';
import {StatusPill} from '@/components/ui/StatusPill';
import {PriorityBadge} from '@/components/ui/PriorityBadge';
import {Avatar} from '@/components/ui/Avatar';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card, CardBody, CardHeader} from '@/components/ui/Card';
import {Spinner} from '@/components/ui/Spinner';
import {TYPE_LABELS} from '@/lib/constants';
import {formatDateTime} from '@/lib/utils';

export default function TicketDetailPage(): React.JSX.Element {
  const params = useParams<{id: string}>();
  const id = params.id;
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const {data: ticket, isLoading} = useTicket(id);
  const {data: projects = []} = useProjects();
  const {data: members = []} = useProjectMembers(ticket?.projectId);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.userId, m.user])),
    [members],
  );
  const nameOf = (uid?: string | null) =>
    uid ? (memberMap.get(uid)?.name ?? memberMap.get(uid)?.email ?? 'Usuario') : 'Sin asignar';

  const project = projects.find((p) => p.id === ticket?.projectId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <p className="text-content-secondary">No se pudo cargar el ticket.</p>
        <Link href="/tickets" className="mt-3 inline-block text-brand hover:underline">
          Volver a tickets
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content">
        ← Tickets
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-content-tertiary">{ticket.key}</span>
            <Badge tone="info">{TYPE_LABELS[ticket.type]}</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-content">{ticket.title}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-content">Descripción</h2>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-wrap text-sm text-content-secondary">
                {ticket.description || 'Sin descripción.'}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <TransitionActions ticketId={ticket.id} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-content">Historial</h2>
            </CardHeader>
            <CardBody>
              <TicketHistory ticketId={ticket.id} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-content">Actividad</h2>
            </CardHeader>
            <CardBody>
              <TicketActivityFeed ticketId={ticket.id} />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CommentSection ticketId={ticket.id} />
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <Meta label="Estado">
                <StatusPill state={ticket.state} />
              </Meta>
              <Meta label="Prioridad">
                <PriorityBadge priority={ticket.priority} />
              </Meta>
              <Meta label="Asignado">
                <span className="flex items-center gap-2">
                  <Avatar size="sm" name={nameOf(ticket.assigneeId)} />
                  <span className="text-sm text-content">{nameOf(ticket.assigneeId)}</span>
                </span>
              </Meta>
              <Meta label="Reportado por">
                <span className="flex items-center gap-2">
                  <Avatar size="sm" name={nameOf(ticket.reporterId)} />
                  <span className="text-sm text-content">{nameOf(ticket.reporterId)}</span>
                </span>
              </Meta>
              <Meta label="Proyecto">
                <span className="text-sm text-content">{project ? `${project.key} · ${project.name}` : '—'}</span>
              </Meta>
              <Meta label="Creado">
                <span className="text-sm text-content-secondary">{formatDateTime(ticket.createdAt)}</span>
              </Meta>
              <Meta label="Actualizado">
                <span className="text-sm text-content-secondary">{formatDateTime(ticket.updatedAt)}</span>
              </Meta>
            </CardBody>
          </Card>
        </aside>
      </div>

      {editing && (
        <EditTicketModal ticket={ticket} members={members} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function Meta({label, children}: {label: string; children: React.ReactNode}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
