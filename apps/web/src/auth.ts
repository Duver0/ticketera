import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import type {Role, SessionUser} from '@ticketera/types';

/**
 * Configuración de Auth.js (NextAuth v5, beta).
 *
 * Estrategia JWT: el token de sesión se firma con AUTH_SECRET y viaja como
 * cookie first-party. El API (NestJS) verifica ese mismo JWT como Bearer
 * (comparten AUTH_SECRET) — ver docs/architecture.md y packages/types.
 *
 * PROVISIONING (E1): al autenticar, el backend asegura que exista el User en
 * Postgres y asigna `role`. El callback `jwt` resuelve el rol desde el objeto
 * `user` que devuelve cada provider (GitHub o Credentials) y el API lo
 * sobre-escribe según la DB en el guard. El shape del token incluye `role`.
 *
 * URL base del API: se usa NEXT_PUBLIC_API_URL (disponible server-side en el
 * route handler de Auth.js y también en el bundle del cliente). Fallback a
 * localhost:3001 para desarrollo local sin .env.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export const {handlers, auth, signIn, signOut} = NextAuth({
  providers: [
    GitHub,
    Credentials({
      name: 'Email y contraseña',
      credentials: {
        email: {label: 'Email', type: 'email'},
        password: {label: 'Contraseña', type: 'password'},
      },
      // authorize corre en el servidor (route handler de Auth.js) y consume la
      // API directamente con URL absoluta. La respuesta exitosa viene envuelta
      // en { data } por el ResponseTransformInterceptor, por eso leemos json.data.
      async authorize(credentials): Promise<SessionUser | null> {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        try {
          const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password}),
          });
          // 401 INVALID_CREDENTIALS (u otro error) -> null (sin filtrar motivo).
          if (!res.ok) return null;
          const json = (await res.json()) as {data: SessionUser};
          return json.data; // { id, email, name, image, role }
        } catch {
          return null;
        }
      },
    }),
  ],
  session: {strategy: 'jwt'},
  callbacks: {
    async jwt({token, user}) {
      if (user) {
        // user viene de GitHub o de Credentials.authorize (SessionUser), que ya
        // trae el rol y la organización resueltos por el API. Para GitHub el
        // rol/org no viajan en el objeto, pero el sync los resuelve luego.
        const u = user as unknown as SessionUser;
        (token as {role?: Role}).role = u.role ?? 'usuario';
        (token as {organizationId?: string | null}).organizationId =
          u.organizationId ?? null;
      }
      return token;
    },
    async session({session, token}) {
      if (session.user) {
        // Exponemos el rol global y la organización en la sesión del cliente.
        const su = session.user as unknown as SessionUser;
        su.role = (token as {role?: Role}).role ?? 'usuario';
        su.organizationId = (token as {organizationId?: string | null}).organizationId ?? null;
      }
      return session;
    },
  },
});
