'use client';

import {useState} from 'react';
import {useTicketTransitions, useTransitionTicket} from '@/lib/api-hooks';
import {useToast} from '@/components/ui/Toast';
import {Button} from '@/components/ui/Button';
import {Modal} from '@/components/ui/Modal';
import {Textarea} from '@/components/ui/Field';
import {STATE_LABELS} from '@/lib/constants';
import type {TicketStateValue} from '@ticketera/types';

/** Acciones de transición: solo pinta las `allowed` del rol (GET transitions). */
export function TransitionActions({ticketId}: {ticketId: string}): React.JSX.Element {
  const {data: transitions = [], isLoading} = useTicketTransitions(ticketId);
  const [target, setTarget] = useState<TicketStateValue | null>(null);
  const [comment, setComment] = useState('');
  const transition = useTransitionTicket(ticketId);
  const {toast} = useToast();

  const allowed = transitions.filter((t) => t.allowed);

  if (isLoading) return <p className="text-sm text-content-tertiary">Cargando acciones…</p>;
  if (allowed.length === 0) {
    return <p className="text-sm text-content-tertiary">No hay transiciones disponibles para tu rol.</p>;
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
        Transiciones
      </h3>
      <div className="flex flex-wrap gap-2">
        {allowed.map((t) => (
          <Button key={t.to} variant="secondary" size="sm" onClick={() => setTarget(t.to)}>
            Mover a {STATE_LABELS[t.to]}
          </Button>
        ))}
      </div>

      <Modal
        open={target !== null}
        onClose={() => {
          setTarget(null);
          setComment('');
        }}
        title={target ? `Mover a ${STATE_LABELS[target]}` : ''}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTarget(null);
                setComment('');
              }}
            >
              Cancelar
            </Button>
            <Button
              loading={transition.isPending}
              onClick={() => {
                if (!target) return;
                transition.mutate(
                  {to: target, comment: comment.trim() || undefined},
                  {
                    onSuccess: () => {
                      toast(`Ticket movido a ${STATE_LABELS[target]}`, 'success');
                      setTarget(null);
                      setComment('');
                    },
                    onError: (e) => toast(e.message, 'error'),
                  },
                );
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-content-secondary">
          Opcionalmente, añade un comentario que quedará registrado en el historial.
        </p>
        <Textarea
          placeholder="Comentario (opcional)…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </div>
  );
}
