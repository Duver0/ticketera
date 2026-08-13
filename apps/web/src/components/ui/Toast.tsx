'use client';

import {createContext, useCallback, useContext, useState, type ReactNode} from 'react';
import {cn} from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

const TONE: Record<ToastType, string> = {
  success: 'border-success/40 bg-success-bg text-success-fg',
  error: 'border-danger/40 bg-danger-bg text-danger-fg',
  info: 'border-info/40 bg-info-bg text-info-fg',
};

/** Proveedor de notificaciones efímeras (role=status/alert). */
export function ToastProvider({children}: {children: ReactNode}): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, {id, message, type}]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{toast}}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-sm shadow-md animate-slide-in',
              TONE[t.type],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
