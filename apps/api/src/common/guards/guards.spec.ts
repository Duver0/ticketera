import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { RequestUser } from '@ticketera/types';
import { ErrorCodes } from '../errors/error-codes';
import { AppError } from '../errors/error-codes';
import type { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from './roles.guard';
import { AdminGuard } from './admin.guard';
import { AgentGuard } from './agent.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeCtx(user?: RequestUser, headers: Record<string, string> = {}): ExecutionContext {
  const req: { user?: RequestUser; headers: Record<string, string> } = { user, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const adminUser: RequestUser = { id: '1', email: 'a@x.com', role: 'admin' };
const agentUser: RequestUser = { id: '2', email: 'g@x.com', role: 'agente' };
const normalUser: RequestUser = { id: '3', email: 'u@x.com', role: 'usuario' };

/** Afirma que fn lanza un AppError con el `code` indicado (síncrono). */
function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('Se esperaba un AppError pero no se lanzó nada');
  } catch (err) {
    if (err instanceof AppError) {
      expect(err.getResponse()).toMatchObject({ code });
      return;
    }
    throw err;
  }
}

/** Afirma que fn lanza un AppError con el `code` indicado (async). */
async function expectCodeAsync(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error('Se esperaba un AppError pero no se lanzó nada');
  } catch (err) {
    if (err instanceof AppError) {
      expect(err.getResponse()).toMatchObject({ code });
      return;
    }
    throw err;
  }
}

describe('RolesGuard', () => {
  it('permite cuando el rol del usuario está en la metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeCtx(adminUser))).toBe(true);
  });

  it('lanza FORBIDDEN cuando el rol no coincide', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expectCode(() => guard.canActivate(makeCtx(normalUser)), ErrorCodes.FORBIDDEN);
  });

  it('permite sin metadata de roles', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeCtx(normalUser))).toBe(true);
  });
});

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  it('permite a admin', () => {
    expect(guard.canActivate(makeCtx(adminUser))).toBe(true);
  });
  it('niega a no-admin', () => {
    expectCode(() => guard.canActivate(makeCtx(agentUser)), ErrorCodes.FORBIDDEN);
  });
});

describe('AgentGuard', () => {
  const guard = new AgentGuard();
  it('permite a agente y admin', () => {
    expect(guard.canActivate(makeCtx(agentUser))).toBe(true);
    expect(guard.canActivate(makeCtx(adminUser))).toBe(true);
  });
  it('niega a usuario', () => {
    expectCode(() => guard.canActivate(makeCtx(normalUser)), ErrorCodes.FORBIDDEN);
  });
});

describe('JwtAuthGuard', () => {
  const jwtMock = {
    verify: jest.fn().mockReturnValue({ sub: 'u1', email: 'e@x.com' }),
  } as unknown as JwtService;
  const prismaMock = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'u1', email: 'e@x.com', role: 'agente' }),
    },
  } as unknown as PrismaService;

  const ctxWith = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers, user: undefined as RequestUser | undefined }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext);

  it('verifica el Bearer, carga el rol desde la DB y popula req.user', async () => {
    const guard = new JwtAuthGuard(jwtMock, prismaMock);
    const req = { headers: { authorization: 'Bearer tok' }, user: undefined as RequestUser | undefined };
    const result = await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(req.user?.role).toBe('agente');
    expect(req.user?.id).toBe('u1');
  });

  it('lanza UNAUTHENTICATED si no hay token', async () => {
    const guard = new JwtAuthGuard(jwtMock, prismaMock);
    await expectCodeAsync(() => guard.canActivate(ctxWith({})), ErrorCodes.UNAUTHENTICATED);
  });

  it('lanza UNAUTHENTICATED si el JWT es inválido', async () => {
    const badJwt = {
      verify: jest.fn().mockImplementation(() => {
        throw new Error('invalid');
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(badJwt, prismaMock);
    await expectCodeAsync(
      () => guard.canActivate(ctxWith({ authorization: 'Bearer bad' })),
      ErrorCodes.UNAUTHENTICATED,
    );
  });
});
