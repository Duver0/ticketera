import {NextRequest, NextResponse} from 'next/server';
import type {ApiError} from '@ticketera/types';

/**
 * Proxy same-origin hacia el API (NestJS) en NEXT_PUBLIC_API_URL.
 *
 * Por qué existe:
 *  - El JWT de sesión (Auth.js, estrategia jwt) vive en una cookie first-party
 *    para ticketera-sigma.vercel.app y NO se expone al browser.
 *  - El servidor de Next SÍ puede leer la cookie de sesión y reenviar el JWT
 *    crudo como `Authorization: Bearer` al API, que lo valida con el mismo
 *    AUTH_SECRET. Esto evita CORS y fugas de token. El browser solo llama a
 *    `/api/proxy/...`.
 *
 * Uso en el cliente: fetch(`/api/proxy/tickets?projectId=SUP`) equivale a
 * `${NEXT_PUBLIC_API_URL}/api/v1/tickets?projectId=SUP`.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

/** Nombres posibles de la cookie de sesión de Auth.js v5 (prod añade __Secure-). */
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'];

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

  const rawToken = SESSION_COOKIE_NAMES.map((name) => req.cookies.get(name)?.value).find(
    (v): v is string => Boolean(v),
  );

  const target = `${API_BASE.replace(/\/$/, '')}/api/v1/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  if (rawToken) {
    headers.set('Authorization', `Bearer ${rawToken}`);
  }
  const incomingContentType = req.headers.get('content-type');
  if (incomingContentType) {
    headers.set('Content-Type', incomingContentType);
  }

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
