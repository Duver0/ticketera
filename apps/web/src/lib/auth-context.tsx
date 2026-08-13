'use client';

import {createContext, useContext, type ReactNode} from 'react';
import {useSession} from 'next-auth/react';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {Role, SessionUser} from '@ticketera/types';

interface AuthContextValue {
  /** Sesión de Auth.js (puede ser null si no autenticado). */
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /** Usuario con rol resuelto vía POST /users/sync. */
  user: SessionUser | null;
  isSyncing: boolean;
  isSyncError: boolean;
  syncError: unknown;
  isAuthed: boolean;
  role: Role | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Resolvemos el rol real llamando a POST /users/sync tras autenticar.
 * El token de Auth.js viaja en cookie; el proxy lo reenvía como Bearer al API,
 * que responde con el perfil (Role global). Así el cliente nunca hardcodea roles.
 */
export function AuthProvider({children}: {children: ReactNode}): React.JSX.Element {
  const {data: session, status} = useSession();

  const {data: syncedUser, isLoading: isLoadingSync, isError: isSyncError, error: syncError} = useQuery<SessionUser>({
    queryKey: ['me'],
    queryFn: () => api.post<SessionUser>('/users/sync'),
    enabled: status === 'authenticated',
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const user = syncedUser ?? null;
  const ctx: AuthContextValue = {
    status,
    user,
    isSyncing: status === 'authenticated' && isLoadingSync && !user,
    isSyncError: status === 'authenticated' && isSyncError && !user,
    syncError,
    isAuthed: status === 'authenticated' && !!user,
    role: user?.role ?? null,
  };

  return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
