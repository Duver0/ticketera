'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useTickets} from '@/lib/api-hooks';
import {TicketFiltersBar, type TicketFiltersValue} from '@/components/TicketFiltersBar';
import {TicketTable} from '@/components/TicketTable';
import {Button} from '@/components/ui/Button';
import {Spinner} from '@/components/ui/Spinner';
import {Card} from '@/components/ui/Card';

const PAGE_SIZE = 20;

export default function TicketsPage(): React.JSX.Element {
  const [filters, setFilters] = useState<TicketFiltersValue>({});
  const [page, setPage] = useState(1);

  const {data, isLoading} = useTickets({...filters, page, pageSize: PAGE_SIZE});

  const updateFilters = (next: TicketFiltersValue) => {
    setFilters(next);
    setPage(1);
  };

  const tickets = data ?? [];
  const hasNext = tickets.length === PAGE_SIZE;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-content">Tickets</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Filtra y gestiona el trabajo de tus proyectos.
          </p>
        </div>
        <Link href="/tickets/new">
          <Button>Crear ticket</Button>
        </Link>
      </div>

      <TicketFiltersBar value={filters} onChange={updateFilters} />

      <div className="mt-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <TicketTable tickets={tickets} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-content-secondary">
        <span>
          Página {page} · {tickets.length} resultados
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
