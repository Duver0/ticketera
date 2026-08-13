import type { Role, TicketStateValue } from '@ticketera/types';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from '../common/interceptors/response-transform.interceptor';

/**
 * Prueba de INTEGRACIÓN del flujo crítico (máquina de estados vía HTTP).
 *
 * Arranca el AppModule completo de NestJS y valida el contrato real:
 *   POST /api/v1/tickets                  -> 201, estado inicial `abierto`
 *   GET  /api/v1/tickets/:id/transitions  -> opciones permitidas según rol
 *   POST /api/v1/tickets/:id/transitions  -> 200 (agente) y persiste TicketHistory
 *   POST /api/v1/tickets/:id/transitions  -> 403 (usuario, rol no habilitado)
 *
 * Para correr en CI SIN secretos/DB reales, se sustituye `PrismaService` por un
 * mock en memoria con un store coherente (crear -> leer -> transicionar).
 * El `JwtAuthGuard` sigue verificando la firma HS256 con `AUTH_SECRET` (del .env)
 * y resuelve el rol consultando este mock, igual que en producción.
 *
 * Nota: una prueba HTTP contra Neon real (con usuarios `agente`/`usuario` ya
 * sembrados) daría cobertura end-to-end de la DB; aquí priorizamos determinismo
 * y aislamiento (ver docs/quality-gates.md).
 */

/** Store en memoria que simula Prisma para el flujo de tickets. */
function createPrismaMock() {
  type UserRow = { id: string; email: string; role: Role };
  type TicketRow = {
    id: string;
    projectId: string;
    number: number;
    key: string;
    title: string;
    description: string | null;
    state: string;
    priority: string;
    type: string;
    reporterId: string;
    assigneeId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  type HistoryRow = {
    id: string;
    ticketId: string;
    actorId: string;
    fromState: string;
    toState: string;
    createdAt: Date;
  };

  const users = new Map<string, UserRow>([
    ['agent-1', { id: 'agent-1', email: 'agent@test.dev', role: 'agente' }],
    ['user-1', { id: 'user-1', email: 'user@test.dev', role: 'usuario' }],
  ]);
  const tickets = new Map<string, TicketRow>();
  const histories: HistoryRow[] = [];
  let ticketSeq = 0;

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.get(where.id) ?? null;
        if (where.email) {
          for (const u of users.values()) if (u.email === where.email) return u;
        }
        return null;
      }),
    },
    projectMember: {
      // Cualquier usuario es miembro de cualquier proyecto en este mock
      // (aislamos la autorización de la máquina de estados, no la de proyecto).
      findUnique: jest.fn(async () => ({
        id: 'pm-1',
        projectId: 'p1',
        userId: 'any',
        roleInProject: 'agente' as Role,
      })),
    },
    project: {
      findUnique: jest.fn(async () => ({ id: 'p1', key: 'TST' })),
    },
    ticket: {
      aggregate: jest.fn(async () => ({ _max: { number: null } })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `ticket-${++ticketSeq}`;
        const row: TicketRow = {
          id,
          projectId: data.projectId as string,
          number: data.number as number,
          key: `${data.key}`,
          title: data.title as string,
          description: (data.description as string) ?? null,
          state: 'abierto',
          priority: (data.priority as string) ?? 'media',
          type: (data.type as string) ?? 'tarea',
          reporterId: data.reporterId as string,
          assigneeId: (data.assigneeId as string) ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        tickets.set(id, row);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const t = tickets.get(where.id);
        return t ? { ...t } : null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const t = tickets.get(where.id);
        if (!t) return null;
        Object.assign(t, data);
        t.updatedAt = new Date();
        return { ...t };
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        tickets.delete(where.id);
      }),
    },
    ticketHistory: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const h: HistoryRow = {
          id: `h-${histories.length + 1}`,
          ticketId: data.ticketId as string,
          actorId: data.actorId as string,
          fromState: data.fromState as string,
          toState: data.toState as string,
          createdAt: new Date(),
        };
        histories.push(h);
        return { ...h };
      }),
      findMany: jest.fn(async ({ where }: { where: { ticketId: string } }) =>
        histories
          .filter((h) => h.ticketId === where.ticketId)
          .map((h) => ({ ...h, actor: { id: h.actorId, name: null } }))
          .reverse(),
      ),
    },
    notification: {
      create: jest.fn(async () => ({ id: 'n-1' })),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  return { prisma, tickets, histories };
}

describe('Integración: máquina de estados vía API (HTTP)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prismaMock: ReturnType<typeof createPrismaMock>['prisma'];
  let ticketsStore: ReturnType<typeof createPrismaMock>['tickets'];
  let historiesStore: ReturnType<typeof createPrismaMock>['histories'];
  let baseUrl: string;

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    if (!process.env.AUTH_SECRET) {
      throw new Error('AUTH_SECRET no está definido; la prueba necesita apps/api/.env');
    }
    const mock = createPrismaMock();
    prismaMock = mock.prisma;
    ticketsStore = mock.tickets;
    historiesStore = mock.histories;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock as unknown as PrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseTransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;

    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /** Genera un JWT HS256 firmado con AUTH_SECRET para un usuario sembrado en el mock. */
  function signFor(sub: string, email: string): string {
    return jwtService.sign({ sub, email });
  }

  it('crea un ticket en estado inicial `abierto` (POST /api/v1/tickets)', async () => {
    const token = signFor('agent-1', 'agent@test.dev');
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ projectId: 'p1', title: 'Ticket de prueba', description: 'desc' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; state: TicketStateValue } };
    expect(body.data.state).toBe('abierto');
    const stored = ticketsStore.get(body.data.id);
    expect(stored?.state).toBe('abierto');
  });

  it('GET /api/v1/tickets/:id/transitions lista las transiciones permitidas para `agente`', async () => {
    const token = signFor('agent-1', 'agent@test.dev');
    // Creamos un ticket fresco para este escenario.
    const created = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ projectId: 'p1', title: 'Transitions' }),
    });
    const createdBody = (await created.json()) as { data: { id: string } };
    const id = createdBody.data.id;

    const res = await fetch(`${baseUrl}/api/v1/tickets/${id}/transitions`, {
      headers: auth(token),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ to: string; allowed: boolean }> };
    const opts = body.data;
    expect(Array.isArray(opts)).toBe(true);
    const enProgreso = opts.find((o) => o.to === 'en_progreso');
    const resuelto = opts.find((o) => o.to === 'resuelto');
    expect(enProgreso?.allowed).toBe(true);
    expect(resuelto?.allowed).toBe(false);
  });

  it('agente transiciona abierto -> en_progreso (200) y persiste TicketHistory', async () => {
    const token = signFor('agent-1', 'agent@test.dev');
    const created = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ projectId: 'p1', title: 'Transicionar' }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const res = await fetch(`${baseUrl}/api/v1/tickets/${id}/transitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ to: 'en_progreso' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { state: TicketStateValue } };
    expect(body.data.state).toBe('en_progreso');

    const stored = ticketsStore.get(id);
    expect(stored?.state).toBe('en_progreso');
    expect(historiesStore.length).toBeGreaterThanOrEqual(1);
    expect(historiesStore.some((h) => h.ticketId === id && h.toState === 'en_progreso')).toBe(true);
  });

  it('usuario NO puede transicionar (403 TRANSITION_NOT_ALLOWED)', async () => {
    const agentTok = signFor('agent-1', 'agent@test.dev');
    const userTok = signFor('user-1', 'user@test.dev');

    // Ticket creado por el agente (reporterId = agent-1) para aislar la negación
    // de la máquina de estados del rol `usuario`.
    const created = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(agentTok) },
      body: JSON.stringify({ projectId: 'p1', title: 'Prohibido para usuario' }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const res = await fetch(`${baseUrl}/api/v1/tickets/${id}/transitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(userTok) },
      body: JSON.stringify({ to: 'en_progreso' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('TRANSITION_NOT_ALLOWED');
    // El estado NO debe haber cambiado.
    expect(ticketsStore.get(id)?.state).toBe('abierto');
  });

  it('rechaza peticiones sin token (401 UNAUTHENTICATED)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'p1', title: 'sin auth' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});
