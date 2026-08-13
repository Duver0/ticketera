import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Interceptor global de éxito. Envuelve TODA respuesta exitosa en la forma
 * estable de la API: `{ "data": <payload> }`. Las respuestas de error las maneja
 * AllExceptionsFilter (formato `{ "error": {...} }`), así que aquí no las tocamos.
 *
 * - Si el body es `undefined`/`null` (ej. DELETE 204) no se envuelve.
 * - Si ya es un objeto con clave `error`, se deja pasar (no debería ocurrir en
 *   el flujo de éxito, pero evita doble envoltura).
 */
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, { data: T }> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<{ data: T }> {
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null) {
          return data as unknown as { data: T };
        }
        if (typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
          return data as unknown as { data: T };
        }
        return { data };
      }),
    );
  }
}
