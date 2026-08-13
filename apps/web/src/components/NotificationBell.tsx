'use client';

import {useEffect, useRef, useState} from 'react';
import {useAuth} from '@/lib/auth-context';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/api-hooks';
import {formatDateTime} from '@/lib/utils';
import {Avatar} from '@/components/ui/Avatar';
import {Button} from '@/components/ui/Button';
import {EmptyState} from '@/components/ui/Spinner';

interface NotificationPayload {
  title?: string;
  body?: string;
  ticketKey?: string;
}

/** Campana de notificaciones con badge de no leídas y panel propio. */
export function NotificationBell(): React.JSX.Element {
  const {user} = useAuth();
  const {data: notifications = []} = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return <span className="h-9 w-9" aria-hidden />;

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notificaciones${unread ? `, ${unread} no leídas` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 8a6 6 0 0112 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 21h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-fg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-content">Notificaciones</span>
            <button
              onClick={() => markAll.mutate()}
              disabled={unread === 0}
              className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
            >
              Marcar todas leídas
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin notificaciones" />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {notifications.map((n) => {
                  const p = (n.payload ?? {}) as NotificationPayload;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => !n.read && markRead.mutate(n.id)}
                        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-muted ${
                          n.read ? 'opacity-60' : ''
                        }`}
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-content">
                            {p.title ?? 'Notificación'}
                          </span>
                          {p.body && (
                            <span className="block truncate text-xs text-content-secondary">
                              {p.body}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11px] text-content-tertiary">
                            {formatDateTime(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
