import type {ApiError} from '@ticketera/types';

/**
 * Cliente HTTP del Web. El browser solo habla con el proxy same-origin
 * `/api/proxy/*`, que reenvía al API NestJS añadiendo el Bearer JWT.
 *
 * Mantener en sincronía con docs/api-contract.md.
 */

const PROXY_BASE = '/api/proxy';

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY_BASE}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json().catch(() => null)) as T | ApiError | null;

  if (!res.ok) {
    const err = json as ApiError | null;
    throw new ApiClientError(
      err?.error?.code ?? 'UNKNOWN',
      err?.error?.message ?? 'Error de red',
      res.status,
      err?.error?.details,
    );
  }

  // Envoltura { data } para lecturas; para 204 devolvemos null.
  if (res.status === 204 || json === null) {
    return null as unknown as T;
  }
  const maybe = json as {data?: T};
  return (maybe.data ?? (json as T)) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path, {method: 'GET'}),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, {method: 'POST', body: body ? JSON.stringify(body) : undefined}),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, {method: 'PATCH', body: body ? JSON.stringify(body) : undefined}),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, {method: 'PUT', body: body ? JSON.stringify(body) : undefined}),
  delete: <T,>(path: string) => request<T>(path, {method: 'DELETE'}),
};

export type {ApiError};
