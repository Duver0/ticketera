'use client';

import {useState, type ReactNode} from 'react';
import {SessionProvider} from 'next-auth/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider} from '@/lib/auth-context';
import {ThemeProvider} from '@/lib/theme';
import {ToastProvider} from '@/components/ui/Toast';

/**
 * Providers raíz: Sesión (Auth.js) + React Query + Auth(rol) + Tema + Toast.
 * El QueryClient se crea una vez por cliente (useState).
 */
export function Providers({children}: {children: ReactNode}): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {refetchOnWindowFocus: false, retry: 1, staleTime: 30_000},
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
