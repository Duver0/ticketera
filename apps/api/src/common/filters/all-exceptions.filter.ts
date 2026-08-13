import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@ticketera/types';
import { ErrorCode, ErrorCodes } from '../errors/error-codes';

/**
 * Filtro global de excepciones. Normaliza TODA respuesta de error al formato
 * estable de la API: { error: { code, message, details? } }.
 *
 * - HttpException conocidas: respeta status y extrae `code`/`message`/`details`
 *   si el payload del exception es un objeto (ver AppError).
 * - Cualquier otro error: 500 INTERNAL_ERROR.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode | string = ErrorCodes.INTERNAL_ERROR;
    let message = 'Error interno del servidor';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        const rawCode = record['code'];
        const rawMessage = record['message'];
        const rawDetails = record['details'];
        code = typeof rawCode === 'string' ? rawCode : `HTTP_${status}`;
        message = typeof rawMessage === 'string' ? rawMessage : exception.message;
        details = rawDetails;
      }
    }

    const payload: ApiError = {
      error: { code: String(code), message, details },
    };

    res.status(status).json(payload);
  }
}
