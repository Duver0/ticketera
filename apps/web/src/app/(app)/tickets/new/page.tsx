'use client';

import {useRouter} from 'next/navigation';
import {TicketForm} from '@/components/TicketForm';
import {Card, CardBody, CardHeader} from '@/components/ui/Card';
import {useToast} from '@/components/ui/Toast';
import type {TicketDto} from '@ticketera/types';

export default function NewTicketPage(): React.JSX.Element {
  const router = useRouter();
  const {toast} = useToast();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-content">Crear ticket</h1>
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">Detalles del ticket</h2>
        </CardHeader>
        <CardBody>
          <TicketForm
            onSuccess={(ticket: TicketDto) => {
              toast('Ticket creado correctamente', 'success');
              router.push(`/tickets/${ticket.id}`);
            }}
            onCancel={() => router.push('/tickets')}
          />
        </CardBody>
      </Card>
    </div>
  );
}
