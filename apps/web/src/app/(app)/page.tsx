'use client';

import Link from 'next/link';
import {ReactNode} from 'react';
import {useAuth} from '@/lib/auth-context';
import {useTickets} from '@/lib/api-hooks';
import {Card} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Spinner} from '@/components/ui/Spinner';
import {STATUS_BAR_COLOR, STATE_LABELS, STATE_ORDER} from '@/lib/constants';
import {isToday} from '@/lib/utils';

function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-content">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-content-secondary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export default function DashboardPage(): React.JSX.Element {
  const {user} = useAuth();
  const myOpen = useTickets({reporterId: user?.id, state: 'abierto', pageSize: 200});
  const assigned = useTickets({assigneeId: user?.id, pageSize: 200});
  const all = useTickets({pageSize: 200});

  if (!user) return <Spinner />;

  const assignedList = assigned.data ?? [];
  const resolvedToday = assignedList.filter(
    (t) => t.state === 'resuelto' && isToday(t.updatedAt),
  ).length;

  const byState = STATE_ORDER.map((s) => ({
    state: s,
    count: (all.data ?? []).filter((t) => t.state === s).length,
  }));
  const max = Math.max(1, ...byState.map((b) => b.count));
  const total = byState.reduce((acc, b) => acc + b.count, 0);

  return (
    <div>
      <PageHeader
        title={`Hola, ${user.name?.split(' ')[0] ?? 'agente'} 👋`}
        subtitle="Resumen de tu actividad en ticketera"
        action={
          <Link href="/tickets/new">
            <Button>Crear ticket</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Mis tickets abiertos"
          value={myOpen.data?.length ?? 0}
          tone="open"
          loading={myOpen.isLoading}
        />
        <MetricCard
          label="Asignados a mí"
          value={assignedList.length}
          tone="progress"
          loading={assigned.isLoading}
        />
        <MetricCard
          label="Resueltos hoy"
          value={resolvedToday}
          tone="done"
          loading={assigned.isLoading}
        />
      </div>

      <Card className="mt-6">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-content">Distribución por estado</h2>
          <p className="text-xs text-content-tertiary">{total} tickets en total</p>
        </div>
        <div className="space-y-3 p-4">
          {byState.map((b) => (
            <div key={b.state} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-content-secondary">
                {STATE_LABELS[b.state]}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full"
                  style={{width: `${(b.count / max) * 100}%`, background: STATUS_BAR_COLOR[b.state]}}
                  aria-hidden
                />
              </div>
              <span className="w-8 text-right text-xs font-semibold text-content">{b.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
  tone: 'open' | 'progress' | 'done';
  loading: boolean;
}): React.JSX.Element {
  const accent = {
    open: 'border-l-brand',
    progress: 'border-l-info',
    done: 'border-l-success',
  } as const;
  return (
    <Card className={`border-l-4 ${accent[tone]}`}>
      <div className="p-4">
        {loading ? (
          <Spinner className="h-6 w-6" />
        ) : (
          <p className="text-3xl font-semibold text-content">{value}</p>
        )}
        <p className="mt-1 text-sm text-content-secondary">{label}</p>
      </div>
    </Card>
  );
}
