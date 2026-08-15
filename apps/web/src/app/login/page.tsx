'use client';

import {Suspense, useEffect, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {signIn, useSession} from 'next-auth/react';
import {Button} from '@/components/ui/Button';
import {Field, Input} from '@/components/ui/Field';
import {Spinner} from '@/components/ui/Spinner';
import {Tabs} from '@/components/ui/Tabs';
import type {RegisterDto, Role} from '@ticketera/types';

/**
 * Pantalla de login con Auth.js: toggle entre "Iniciar sesión" (GitHub +
 * credenciales) y "Crear cuenta" (registro de credenciales).
 *
 * El registro ya NO hace auto-login (flujo defectuoso): al crear la cuenta
 * navega a la pestaña de login con un flag de éxito y el email prefijado, y el
 * usuario inicia sesión manualmente (login de credenciales, que sí es estable).
 */

// --- Tipos locales mínimos ---
type LoginPayload = {email: string; password: string};
type SessionUserDTO = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role: Role;
};
type ApiErrorDTO = {error: {code: string; message: string}};

// Slug de organización: ^[a-z0-9]+(?:-[a-z0-9]+)*$, 3..40.
const ORG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Base absoluta del API. NEXT_PUBLIC_API_URL está disponible en el bundle del
// cliente (registro va por fetch directo, público, NO por el proxy auth).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

const GENERIC_ERROR = 'No pudimos procesar tu solicitud. Intenta de nuevo más tarde.';

export default function LoginPage(): React.JSX.Element {
  // useSearchParams() requiere un límite de Suspense para el build estático.
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-surface px-4">
          <Spinner className="h-6 w-6" />
        </main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner(): React.JSX.Element {
  const searchParams = useSearchParams();
  const {status} = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Estado compartido entre ambos formularios (el email viaja entre pestañas).
  const [email, setEmail] = useState('');
  // Error compartido: permite que el error de registro (p.ej. correo repetido)
  // se muestre en la pestaña de login tras hacer switch de modo.
  const [error, setError] = useState<string | null>(null);
  const [registeredBanner, setRegisteredBanner] = useState(false);

  // Sincroniza flag de éxito + email prefijado desde la URL tras un registro.
  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setRegisteredBanner(true);
      const emailFromUrl = searchParams.get('email') ?? '';
      // Solo prefija si el campo está vacío: no pisa lo que el usuario escriba.
      setEmail((prev) => prev || emailFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const loading = status === 'loading';

  function handleTabChange(key: string): void {
    setMode(key as 'login' | 'register');
    // Cambio manual de pestaña: limpia errores obsoletos.
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-2xl font-bold text-brand-fg">
            t
          </span>
          <h1 className="text-xl font-semibold text-content">ticketera</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Gestión de tickets tipo Jira.
          </p>
        </div>

        {registeredBanner && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-success bg-success/10 px-3 py-2 text-sm text-success"
          >
            Cuenta creada. Inicia sesión con tu correo y contraseña.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <>
            <div className="mb-6 flex justify-center">
              <Tabs
                tabs={[
                  {key: 'login', label: 'Iniciar sesión'},
                  {key: 'register', label: 'Crear cuenta'},
                ]}
                value={mode}
                onChange={handleTabChange}
              />
            </div>

            {mode === 'login' ? (
              <LoginForm email={email} setEmail={setEmail} error={error} setError={setError} />
            ) : (
              <RegisterForm
                email={email}
                setEmail={setEmail}
                setMode={setMode}
                error={error}
                setError={setError}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

type SharedEmailProps = {
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
};

type SharedErrorProps = {
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

/** Modo "Iniciar sesión": GitHub + formulario de credenciales. */
function LoginForm({
  email,
  setEmail,
  error,
  setError,
}: SharedEmailProps & SharedErrorProps): React.JSX.Element {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emailInvalid = email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/',
      });
      if (result?.ok) {
        router.replace('/');
        return;
      }
      // authorize devuelve null ante 401 INVALID_CREDENTIALS (u otro fallo).
      setError('Correo o contraseña incorrectos');
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => void signIn('github', {callbackUrl: '/'})}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0112 6.84c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.04 10.04 0 0022 12.25C22 6.58 17.52 2 12 2z" />
        </svg>
        Iniciar sesión con GitHub
      </Button>

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs uppercase tracking-wide text-content-tertiary">o con email</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4" noValidate>
        <Field
          label="Email"
          htmlFor="login-email"
          required
          error={emailInvalid ? 'Ingresa un email válido' : undefined}
        >
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            invalid={emailInvalid}
            aria-describedby={emailInvalid ? 'login-email-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="Contraseña" htmlFor="login-password" required>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" loading={submitting} disabled={submitting}>
          Iniciar sesión
        </Button>
      </form>
    </div>
  );
}

/**
 * Modo "Crear cuenta": registro de credenciales. Al crear la cuenta navega a la
 * pestaña de login (con flag + email prefijado) en lugar de auto-loguear, para
 * evitar el flujo defectuoso de signIn justo después del registro.
 */
function RegisterForm({
  email,
  setEmail,
  setMode,
  error,
  setError,
}: SharedEmailProps &
  SharedErrorProps & {setMode: React.Dispatch<React.SetStateAction<'login' | 'register'>>}): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  // Opción de organización: crear (slug), unirse (código) u omitir.
  const [orgMode, setOrgMode] = useState<'create' | 'join' | 'none'>('create');
  const [orgSlug, setOrgSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emailInvalid = email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const passwordHint = 'Mínimo 8 caracteres, con letra y número.';
  const passwordInvalid = password.length > 0 && !/(?=.*[A-Za-z])(?=.*\d).{8,}/.test(password);
  const slugInvalid =
    orgMode === 'create' && orgSlug.length > 0 && (!ORG_SLUG_RE.test(orgSlug) || orgSlug.length > 40);
  const inviteCodeInvalid = orgMode === 'join' && inviteCode.trim().length === 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    if (!name.trim() || emailInvalid || passwordInvalid) {
      setError('Revisa los campos resaltados.');
      return;
    }
    if (orgMode === 'create' && (orgSlug.trim().length < 3 || slugInvalid)) {
      setError('El slug de la organización debe tener 3–40 caracteres (minúsculas, letras, números y guiones).');
      return;
    }
    if (orgMode === 'join' && inviteCodeInvalid) {
      setError('Ingresa el código de invitación.');
      return;
    }

    // RegisterDto: organizationSlug / inviteCode son mutuamente excluyentes y opcionales.
    const payload: RegisterDto = {name: name.trim(), email, password};
    if (orgMode === 'create') payload.organizationSlug = orgSlug.trim();
    if (orgMode === 'join') payload.inviteCode = inviteCode.trim();

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        // Éxito: cambia a la pestaña de login y navega con flag + email prefijado
        // (sin auto-login defectuoso). El usuario inicia sesión manualmente, que
        // sí funciona. La navegación es a la misma ruta (cambia solo el query),
        // así que el estado `mode` persiste: lo forzamos a 'login'.
        setMode('login');
        router.replace('/login?registered=1&email=' + encodeURIComponent(email));
        return;
      }

      // Errores: mapear códigos HTTP / código de la API a mensajes en español.
      let code = '';
      try {
        const body = (await res.json()) as ApiErrorDTO;
        code = body?.error?.code ?? '';
      } catch {
        /* cuerpo no legible */
      }

      if (res.status === 409 || code === 'EMAIL_ALREADY_EXISTS') {
        // Correo repetido: cambia a la pestaña de login conservando el email y
        // mostrando un mensaje claro (evita el "strand" silencioso).
        setError('Este correo ya está registrado. Inicia sesión con tu contraseña.');
        setMode('login');
        return;
      } else if (code === 'ORG_SLUG_TAKEN') {
        setError('Ese slug de organización ya está en uso');
      } else if (code === 'INVITE_CODE_INVALID') {
        setError('El código de invitación no es válido');
      } else if (
        res.status === 400 &&
        (code === 'WEAK_PASSWORD' || code === 'VALIDATION_ERROR' || code === 'ORG_SLUG_INVALID')
      ) {
        setError(
          code === 'ORG_SLUG_INVALID'
            ? 'El slug no es válido (3–40 chars, minúsculas, letras, números y guiones)'
            : 'La contraseña debe tener al menos 8 caracteres e incluir letra y número',
        );
      } else {
        setError(GENERIC_ERROR);
      }
    } catch {
      setError('No pudimos conectar con el servidor. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" htmlFor="register-name" required>
        <Input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>

      <Field
        label="Email"
        htmlFor="register-email"
        required
        error={emailInvalid ? 'Ingresa un email válido' : undefined}
      >
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          invalid={emailInvalid}
          aria-describedby={emailInvalid ? 'register-email-error' : undefined}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>

      <Field
        label="Contraseña"
        htmlFor="register-password"
        required
        error={passwordInvalid ? 'Cumple el formato requerido' : undefined}
        hint={passwordHint}
      >
        <Input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          invalid={passwordInvalid}
          aria-describedby={passwordInvalid ? 'register-password-error' : undefined}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      {/* Organización: crear, unirse o omitir (opcional) */}
      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-content-tertiary">
          Organización
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Organización al registrarse">
          {(['create', 'join', 'none'] as const).map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-1.5 text-sm text-content-secondary"
            >
              <input
                type="radio"
                name="org-mode"
                value={mode}
                checked={orgMode === mode}
                onChange={() => setOrgMode(mode)}
                className="accent-brand"
              />
              {mode === 'create' && 'Crear organización'}
              {mode === 'join' && 'Unirme con código'}
              {mode === 'none' && 'Sin organización'}
            </label>
          ))}
        </div>

        {orgMode === 'create' && (
          <div className="mt-3">
            <Field
              label="Slug de la organización"
              htmlFor="register-org-slug"
              required
              error={slugInvalid ? 'Formato no válido (3–40, minúsculas, guiones)' : undefined}
              hint="Identificador único, p.ej. mi-equipo"
            >
              <Input
                id="register-org-slug"
                value={orgSlug}
                invalid={slugInvalid}
                placeholder="mi-equipo"
                onChange={(e) => setOrgSlug(e.target.value.toLowerCase())}
              />
            </Field>
          </div>
        )}

        {orgMode === 'join' && (
          <div className="mt-3">
            <Field label="Código de invitación" htmlFor="register-invite" required>
              <Input
                id="register-invite"
                value={inviteCode}
                placeholder="código proporcionado por tu org"
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </Field>
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" loading={submitting} disabled={submitting}>
        Crear cuenta
      </Button>
    </form>
  );
}
