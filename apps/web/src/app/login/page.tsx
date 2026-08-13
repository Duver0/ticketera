'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {signIn, useSession} from 'next-auth/react';
import {Button} from '@/components/ui/Button';
import {Spinner} from '@/components/ui/Spinner';

/** Pantalla de login con Auth.js (GitHub). Redirige si ya hay sesión. */
export default function LoginPage(): React.JSX.Element {
  const {status} = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const loading = status === 'loading';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-2xl font-bold text-brand-fg">
            t
          </span>
          <h1 className="text-xl font-semibold text-content">ticketera</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Gestión de tickets tipo Jira. Inicia sesión para continuar.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <Button
            onClick={() => void signIn('github', {callbackUrl: '/'})}
            className="w-full"
            size="md"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0112 6.84c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.04 10.04 0 0022 12.25C22 6.58 17.52 2 12 2z" />
            </svg>
            Iniciar sesión con GitHub
          </Button>
        )}
      </div>
    </main>
  );
}
