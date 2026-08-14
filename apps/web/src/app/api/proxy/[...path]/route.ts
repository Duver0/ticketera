import {NextRequest, NextResponse} from 'next/server';
import {getToken, decode} from 'next-auth/jwt';
import jwt from 'jsonwebtoken';
import type {ApiError} from '@ticketera/types';

/**
 * Proxy same-origin hacia el API (NestJS) en NEXT_PUBLIC_API_URL.
 *
 * Por qué existe:
 *  - La sesión de Auth.js (estrategia jwt) vive en una cookie first-party
 *    para ticketera-sigma.vercel.app y NO se expone al browser.
 *  - El JWT de sesión de Auth.js se guarda en la cookie COMO JWE CIFRADO,
 *    por lo que NO puede reenviarse tal cual como `Bearer` (el API lo
 *    rechazaría con 401 "Token inválido o expirado").
 *  - En su lugar, en el servidor decodificamos la sesión con `getToken` y
 *    firmamos un NUEVO JWT (JWS, HS256) con el MISMO `AUTH_SECRET`, que el
 *    API verifica. Así comparten secreto y evitamos CORS/fugas de token.
 *
 * Uso en el cliente: fetch(`/api/proxy/tickets?projectId=SUP`) equivale a
 * `${NEXT_PUBLIC_API_URL}/api/v1/tickets?projectId=SUP`.
 */
export const runtime = 'nodejs';

const API_BASE = process.env.NEXT_PUBLIC_API_URL;
const AUTH_SECRET = process.env.AUTH_SECRET;

/**
 * Resuelve la sesión de Auth.js en el servidor del proxy.
 *
 * Usa `getToken` (v5) y, si no encuentra la cookie (por ejemplo, por la
 * detección de cookie segura `__Secure-authjs.session-token` en producción
 * detrás de un proxy inverso), lee explícitamente ambos posibles nombres de
 * cookie y descifra el JWE con `decode`. Así garantizamos que el Bearer JWT
 * siempre se adjunte al reenvío al API.
 */
async function getSession(req: NextRequest, secret: string): Promise<Record<string, unknown> | null> {
  const fromGetToken = await getToken({req, secret});
  if (fromGetToken) return fromGetToken as Record<string, unknown>;

  const cookieName = req.cookies.has('__Secure-authjs.session-token')
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const raw = req.cookies.get(cookieName)?.value;
  if (raw) {
    // El `salt` es el nombre completo de la cookie (incluido el prefijo
    // `__Secure-` en producción), igual que usa Auth.js al cifrar el JWE.
    const decoded = await decode({token: raw, secret, salt: cookieName});
    if (decoded) return decoded as Record<string, unknown>;
  }
  return null;
}

export async function GET(
  req: NextRequest,
  {params}: {params: Promise<{path: string[]}>},
): Promise<NextResponse> {
  const {path} = await params;
  return forward(req, path, 'GET');
}

export async function POST(
  req: NextRequest,
  {params}: {params: Promise<{path: string[]}>},
): Promise<NextResponse> {
  const {path} = await params;
  return forward(req, path, 'POST');
}

export async function PATCH(
  req: NextRequest,
  {params}: {params: Promise<{path: string[]}>},
): Promise<NextResponse> {
  const {path} = await params;
  return forward(req, path, 'PATCH');
}

export async function PUT(
  req: NextRequest,
  {params}: {params: Promise<{path: string[]}>},
): Promise<NextResponse> {
  const {path} = await params;
  return forward(req, path, 'PUT');
}

export async function DELETE(
  req: NextRequest,
  {params}: {params: Promise<{path: string[]}>},
): Promise<NextResponse> {
  const {path} = await params;
  return forward(req, path, 'DELETE');
}

async function forward(
  req: NextRequest,
  path: string[],
  method: string,
): Promise<NextResponse> {
  if (!API_BASE) {
    return NextResponse.json(
      {error: {code: 'CONFIG_ERROR', message: 'NEXT_PUBLIC_API_URL no definido'}} satisfies ApiError,
      {status: 500},
    );
  }

  const headers = new Headers();

  // Firmar un JWT estándar (HS256) válido para el API a partir de la sesión
  // decodificada de Auth.js. El API lo verifica con @nestjs/jwt y el MISMO
  // AUTH_SECRET. (Auth.js guarda la sesión como JWE cifrado, por eso no se
  // puede reenviar la cookie tal cual ni usar `encode` de next-auth/jwt,
  // que también produce JWE.)
  if (AUTH_SECRET) {
    const session = await getSession(req, AUTH_SECRET);
    if (session) {
      const apiJwt = jwt.sign(
        {
          sub: session.sub,
          email: (session as {email?: string}).email,
          name: (session as {name?: string}).name,
          picture: (session as {picture?: string}).picture,
        },
        AUTH_SECRET,
        {expiresIn: '1h'},
      );
      headers.set('Authorization', `Bearer ${apiJwt}`);
    }
  }

  const incomingContentType = req.headers.get('content-type');
  if (incomingContentType) {
    headers.set('Content-Type', incomingContentType);
  }

  const target = `${API_BASE.replace(/\/$/, '')}/api/v1/${path.join('/')}${req.nextUrl.search}`;
  const hasBody = method !== 'GET' && method !== 'DELETE';
  const bodyBuffer: ArrayBuffer | null = hasBody ? await req.arrayBuffer() : null;

  const upstream = await fetch(target, {
    method,
    headers,
    body: bodyBuffer && bodyBuffer.byteLength > 0 ? Buffer.from(bodyBuffer) : undefined,
  });

  const text = await upstream.text();
  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType) {
    responseHeaders.set('content-type', upstreamContentType);
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
