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

  // Auth / credenciales (email + contraseña)
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

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

   // Organizaciones (alcance por org)
   ORG_SLUG_INVALID: 'ORG_SLUG_INVALID',
   ORG_SLUG_TAKEN: 'ORG_SLUG_TAKEN',
   ORG_NOT_FOUND: 'ORG_NOT_FOUND',
   ORG_ALREADY_MEMBER: 'ORG_ALREADY_MEMBER',
   ORG_REQUIRED: 'ORG_REQUIRED',
   INVITE_CODE_INVALID: 'INVITE_CODE_INVALID',
   NOT_ORG_ADMIN: 'NOT_ORG_ADMIN',

   // Roles de proyecto / equipo
   CANNOT_GRANT_PROJECT_ADMIN: 'CANNOT_GRANT_PROJECT_ADMIN',
   INVITE_TARGET_AMBIGUOUS: 'INVITE_TARGET_AMBIGUOUS',
   LAST_PROJECT_ADMIN: 'LAST_PROJECT_ADMIN',
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
