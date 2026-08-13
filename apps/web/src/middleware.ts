import {auth} from '@/auth';

/**
 * Middleware de protección de rutas (Auth.js v5).
 * `auth` actúa como middleware: si no hay sesión en una ruta protegida,
 * redirige a /login. El matcher excluye /login, /api (proxy) y estáticos.
 */
export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
};
