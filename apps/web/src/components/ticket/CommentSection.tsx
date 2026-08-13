'use client';

import {useState} from 'react';
import {useAddComment, useComments, useDeleteComment} from '@/lib/api-hooks';
import {useToast} from '@/components/ui/Toast';
import {Avatar} from '@/components/ui/Avatar';
import {Button} from '@/components/ui/Button';
import {Textarea} from '@/components/ui/Field';
import {Spinner} from '@/components/ui/Spinner';
import {formatDateTime} from '@/lib/utils';

/** Sección de comentarios: lista + textarea para enviar. */
export function CommentSection({ticketId}: {ticketId: string}): React.JSX.Element {
  const {data: comments = [], isLoading} = useComments(ticketId);
  const add = useAddComment(ticketId);
  const remove = useDeleteComment(ticketId);
  const {toast} = useToast();
  const [body, setBody] = useState('');

  const submit = () => {
    const value = body.trim();
    if (!value) return;
    add.mutate(
      {body: value},
      {
        onSuccess: () => setBody(''),
        onError: (e) => toast(e.message, 'error'),
      },
    );
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-content">Comentarios</h3>

      <div className="mb-4 flex gap-2">
        <Textarea
          placeholder="Escribe un comentario…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[60px]"
        />
      </div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={submit} loading={add.isPending} disabled={!body.trim()}>
          Comentar
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : comments.length === 0 ? (
        <p className="text-sm text-content-tertiary">Sé el primero en comentar.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-lg border border-line bg-surface-subtle p-3">
              <Avatar size="sm" name={c.author.name} image={c.author.image} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-content">{c.author.name ?? 'Usuario'}</span>
                  <span className="text-xs text-content-tertiary">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-content-secondary">{c.body}</p>
                <button
                  onClick={() =>
                    remove.mutateAsync(c.id).catch((e) => toast(e.message, 'error'))
                  }
                  className="mt-1 text-xs text-content-tertiary hover:text-danger"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
