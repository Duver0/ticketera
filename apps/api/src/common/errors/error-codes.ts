/**
 * Códigos de error estables de la API. Usados por el AllExceptionsFilter y por
 * los servicios que lanzan HttpException con `code` explícito.
 * Mantener este listado sincronizado con docs/api-contract.md.
 */
export const ErrorCodes = {
  // Genéricos
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  // Dominio
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
  LABEL_NOT_FOUND: 'LABEL_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NOT_PROJECT_MEMBER: 'NOT_PROJECT_MEMBER',
  TICKET_KEY_CONFLICT: 'TICKET_KEY_CONFLICT',
  TRANSITION_NOT_ALLOWED: 'TRANSITION_NOT_ALLOWED',
  SAME_STATE_TRANSITION: 'SAME_STATE_TRANSITION',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ASSIGNEE_NOT_MEMBER: 'ASSIGNEE_NOT_MEMBER',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Helper para lanzar HttpExceptions con un `code` consistente.
 * Los servicios deben usar esto en lugar de `new HttpException` crudo.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(code: ErrorCode, message: string, status: HttpStatus, details?: unknown) {
    super({ code, message, details }, status);
  }
}
