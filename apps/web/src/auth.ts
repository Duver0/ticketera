import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import type {Role} from '@ticketera/types';

/**
 * Configuración de Auth.js (NextAuth v5, beta).
 *
 * Estrategia JWT: el token de sesión se firma con AUTH_SECRET y viaja como
 * cookie first-party. El API (NestJS) verifica ese mismo JWT como Bearer
 * (comparten AUTH_SECRET) — ver docs/architecture.md y packages/types.
 *
 * PROVISIONING (E1): al autenticar, el backend debe asegurar que exista el
 * User en Postgres y asignar `role`. Mientras tanto, el callback `jwt` deja
 * rol por defecto 'usuario' y el backend lo sobre-escribe llamando a
 * POST /users/sync (lo implementa backend). El shape del token debe incluir
 * `role` para que el proxy y el API lo usen.
 */
export const {handlers, auth, signIn, signOut} = NextAuth({
  providers: [GitHub],
  session: {strategy: 'jwt'},
  callbacks: {
    async jwt({token, user}) {
      if (user) {
        // TODO(backend/E1): sincronizar usuario y resolver rol real desde el API.
        (token as {role?: Role}).role = 'usuario';
      }
      return token;
    },
    async session({session, token}) {
      if (session.user) {
        (session.user as {role?: Role}).role =
          (token as {role?: Role}).role ?? 'usuario';
      }
      return session;
    },
  },
});
